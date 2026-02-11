# Field Populator (Locale Adopter) - Logic Flow

A Contentful App that propagates localized content from a source locale to one or more target locales, using an **insert-only merge strategy** that preserves existing translations.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Contentful["Contentful Web App"]
        Entry[Entry Editor]
        Sidebar[Sidebar Location]
    end

    subgraph App["Field Populator App"]
        Dialog[Dialog Component]
        DiffTree[Diff Tree Builder]
        Adopter[Adopt Tree Processor]
        RateLimiter[Rate Limiter]
    end

    subgraph API["Contentful API"]
        CMA[Content Management API]
    end

    Entry --> Sidebar
    Sidebar -->|"openDialog()"| Dialog
    Dialog -->|"Build diff preview"| DiffTree
    Dialog -->|"Adopt changes"| Adopter
    DiffTree --> RateLimiter
    Adopter --> RateLimiter
    RateLimiter --> CMA
    CMA -->|"Entry data"| DiffTree
    CMA -->|"Update entries"| Adopter
```

---

## App Initialization Flow

```mermaid
sequenceDiagram
    participant Browser
    participant SDKProvider
    participant App
    participant SDK as Contentful SDK

    Browser->>SDKProvider: Load app in iframe
    SDKProvider->>SDK: Initialize SDK connection
    SDK-->>SDKProvider: SDK ready with ids, parameters
    SDKProvider->>App: Provide SDK context
    App->>App: Detect location (sidebar/dialog/page)
    App->>App: Render appropriate component
```

---

## SDK Connection Details

```mermaid
flowchart LR
    subgraph Entry["index.jsx"]
        SDKProvider["SDKProvider wrapper"]
    end

    subgraph Hook["useSDK()"]
        sdk["sdk object"]
    end

    subgraph CMAClient["contentful.js"]
        cmaSDK["cmaSDK(sdk)"]
    end

    subgraph API["CMA Client"]
        client["Plain API Client"]
    end

    SDKProvider --> Hook
    Hook --> CMAClient
    CMAClient --> API

    sdk -->|"sdk.cmaAdapter"| client
    sdk -->|"sdk.ids.space"| client
    sdk -->|"sdk.ids.environment"| client
```

The `cmaSDK()` function creates a Contentful Management API client:
- Uses **sdk.cmaAdapter** for authentication (no API keys needed)
- Sets default **spaceId** and **environmentId** from `sdk.ids`
- Prefers **environmentAlias** over raw environment ID when available

---

## Dialog Workflow

```mermaid
flowchart TD
    Start([User clicks Sidebar button]) --> OpenDialog
    OpenDialog[Open Dialog with invocation params]
    OpenDialog --> LoadLocales[Fetch available locales]
    LoadLocales --> SelectLocales[User selects source & target locales]
    SelectLocales --> BuildDiff[Build Diff Tree]
    BuildDiff --> ShowPreview[Display visual diff]
    ShowPreview --> UserReview{User reviews changes}
    UserReview -->|Adjust selections| SelectFields[Select/deselect fields]
    SelectFields --> UserReview
    UserReview -->|Confirm| Adopt[Run adoptEntryTree]
    Adopt --> UpdateEntries[Update entries via CMA]
    UpdateEntries --> RefreshDiff[Refresh diff preview]
    RefreshDiff --> Done([Complete])
```

---

## Diff Tree Building

```mermaid
flowchart TD
    Start([buildDiffTree called]) --> CheckLimits{Check depth & node limits}
    CheckLimits -->|Exceeded| Truncate[Return truncation message]
    CheckLimits -->|OK| CheckVisited{Already visited?}
    CheckVisited -->|Yes| Circular[Return circular reference]
    CheckVisited -->|No| FetchCT[Fetch Content Type]
    FetchCT --> LoopFields[Loop through fields]
    
    LoopFields --> FieldType{Field type?}
    
    FieldType -->|Text/Symbol| CompareText[Compare source vs target strings]
    FieldType -->|RichText| CompareRT[Compare rich text documents]
    FieldType -->|Entry Link| RecurseEntry[Recursively build child diff]
    FieldType -->|Entry Array| RecurseArray[Recursively build for each ref]
    FieldType -->|Asset| CompareAsset[Compare asset references]
    FieldType -->|JSON/Object| CompareJSON[Compare serialized JSON]
    
    CompareText --> AddToDiff[Add to diff tree]
    CompareRT --> AddToDiff
    RecurseEntry --> AddToDiff
    RecurseArray --> AddToDiff
    CompareAsset --> AddToDiff
    CompareJSON --> AddToDiff
    
    AddToDiff --> MoreFields{More fields?}
    MoreFields -->|Yes| LoopFields
    MoreFields -->|No| ReturnTree([Return diff tree])
```

### Safety Controls
- **maxDepth**: Limits recursion depth (default: 4)
- **maxNodes**: Hard cap on total entries traversed (default: 250)
- **visited Set**: Prevents infinite loops from circular references

---

## Adoption (Entry Update) Flow

```mermaid
flowchart TD
    Start([adoptEntryTree called]) --> CheckVisited{Already visited?}
    CheckVisited -->|Yes| Skip([Return - skip])
    CheckVisited -->|No| MarkVisited[Add to visited set]
    MarkVisited --> FetchEntry[Fetch entry from CMA]
    FetchEntry --> FetchCT[Fetch & cache content type]
    FetchCT --> LoopFields[Loop through fields]
    
    LoopFields --> FieldType{Field type?}
    
    FieldType -->|Text| MergeText[mergeSourceAdditionsIntoTarget]
    FieldType -->|RichText| MergeRT[mergeRichTextDocuments]
    FieldType -->|Entry Link| CollectRef[Collect for recursion]
    FieldType -->|Entry Array| CollectRefs[Collect refs for recursion]
    FieldType -->|Other| DeepCopy[Deep copy if changed]
    
    MergeText --> TrackChange[Track changed field]
    MergeRT --> TrackChange
    DeepCopy --> TrackChange
    
    TrackChange --> MoreFields{More fields?}
    MoreFields -->|Yes| LoopFields
    MoreFields -->|No| HasChanges{Any changes?}
    
    HasChanges -->|Yes| UpdateEntry[cma.entry.update]
    HasChanges -->|No| SkipUpdate[Skip update]
    
    UpdateEntry --> Recurse[Recurse into child entries]
    SkipUpdate --> Recurse
    Recurse --> Done([Return summary])
```

---

## Insert-Only Merge Strategy

The app uses an **insert-only** approach to preserve existing translations:

```mermaid
flowchart LR
    subgraph Source["Source Locale (e.g., en-US)"]
        S1["Hello World! Welcome to our site."]
    end
    
    subgraph Target["Target Locale (e.g., es-ES)"]
        T1["¡Hola Mundo!"]
    end
    
    subgraph Result["Merged Result"]
        R1["¡Hola Mundo! Welcome to our site."]
    end
    
    Source --> Diff
    Target --> Diff
    Diff[diff-match-patch] --> Result
```

### Merge Rules

| Diff Operation | Meaning | Action |
|----------------|---------|--------|
| **EQUAL** (0) | Text exists in both | Keep target text |
| **INSERT** (+1) | Text in source, missing in target | **Insert** at correct position |
| **DELETE** (-1) | Text in target, missing in source | **Keep** target (never delete) |

---

## Rich Text Merge Flow

```mermaid
flowchart TD
    Start([mergeRichTextDocuments]) --> AlignBlocks[Align blocks by index]
    AlignBlocks --> LoopBlocks[Loop through blocks]
    
    LoopBlocks --> BlockCase{Block exists in...}
    
    BlockCase -->|Source only| AppendNew[Append source block]
    BlockCase -->|Target only| KeepTarget[Keep target block]
    BlockCase -->|Both, same type| MergeBlock[Merge block content]
    BlockCase -->|Both, diff type| InsertBoth[Keep target, insert source after]
    
    MergeBlock --> NodeType{Block node type?}
    
    NodeType -->|paragraph/heading| MergeInline[Merge inline content with diff]
    NodeType -->|table| MergeTable[Merge table cells recursively]
    NodeType -->|list| MergeList[Merge list items recursively]
    NodeType -->|embedded-entry| KeepAsIs[Keep as-is]
    
    MergeInline --> PreserveMarks[Preserve formatting/marks from insertion point]
    
    PreserveMarks --> NextBlock{More blocks?}
    AppendNew --> NextBlock
    KeepTarget --> NextBlock
    InsertBoth --> NextBlock
    
    NextBlock -->|Yes| LoopBlocks
    NextBlock -->|No| Return([Return merged document])
```

---

## Rate Limiting

```mermaid
flowchart TD
    Start([callCMA wrapper]) --> Throttle[Check rate limit]
    Throttle --> UnderLimit{Under 8 req/sec?}
    UnderLimit -->|Yes| Execute[Execute API call]
    UnderLimit -->|No| Wait[Sleep with jitter]
    Wait --> Throttle
    
    Execute --> Success{Success?}
    Success -->|Yes| Return([Return result])
    Success -->|429 Rate Limit| Retry{Retries left?}
    Retry -->|Yes| Backoff[Exponential backoff]
    Backoff --> Execute
    Retry -->|No| Throw([Throw error])
    Success -->|Other error| Throw
```

### Rate Limiter Settings
- **maxPerSecond**: 8 requests/second (under Contentful's 10/sec limit)
- **jitterMs**: 20-25ms random jitter to prevent thundering herd
- **retries**: 4 attempts with exponential backoff on 429 errors

---

## Component & File Structure

```mermaid
flowchart TB
    subgraph Locations["App Locations"]
        Sidebar["Sidebar.jsx<br/>Entry sidebar button"]
        Dialog["Dialog.jsx<br/>Main UI & controls"]
        ConfigScreen["ConfigScreen.jsx<br/>App configuration"]
        Page["Page.jsx<br/>Standalone page"]
        Home["Home.jsx<br/>Home location"]
    end
    
    subgraph Core["Core Libraries"]
        contentful["contentful.js<br/>CMA client factory"]
        adoptTree["adoptTree.js<br/>Entry update logic"]
        buildDiffTree["buildDiffTree.js<br/>Diff tree generator"]
        rateLimiter["rateLimiter.js<br/>API throttling"]
    end
    
    subgraph Merge["Merge Utilities"]
        mergeText["mergeText.js<br/>Plain text merge"]
        mergeRichText["mergeRichText.js<br/>Rich text merge"]
        renderDiffHtml["renderDiffHtml.js<br/>Visual diff rendering"]
    end
    
    subgraph Helpers["Helper Utilities"]
        helpers["helpers.js<br/>Date normalization, etc."]
        untitledEntries["untitledEntries.js<br/>Entry title resolution"]
    end
    
    Dialog --> adoptTree
    Dialog --> buildDiffTree
    adoptTree --> mergeText
    adoptTree --> mergeRichText
    adoptTree --> rateLimiter
    buildDiffTree --> rateLimiter
    buildDiffTree --> renderDiffHtml
    adoptTree --> contentful
    Dialog --> contentful
```

---

## Key Design Decisions

1. **Insert-only merging**: Never deletes target content, only adds missing content from source
2. **Recursive traversal**: Follows entry references to update linked content
3. **Position-aware insertion**: New content inserted at semantically correct positions
4. **Formatting preservation**: Inserted text inherits marks/styling from insertion point
5. **Rate limiting**: Stays under Contentful API limits with automatic retry
6. **Traversal limits**: Prevents runaway recursion with depth/node caps
7. **Optimistic locking**: Uses entry versions to prevent overwriting concurrent edits
