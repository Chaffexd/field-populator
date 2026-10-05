import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Flex,
  Form,
  Heading,
  Note,
  Paragraph,
  Select,
  Stack,
  Text,
  TextInput,
} from "@contentful/f36-components";
import { useSDK } from "@contentful/react-apps-toolkit";
import { callCMA } from "../lib/rateLimiter";
import { cmaSDK } from "../lib/contentful";
import {
  ALLOWED_BASES_DEFAULT,
  PINNED_TARGET_LOCALES,
} from "../lib/localeUtils";

const HIDDEN_FIELDS_DEFAULT = [
  "poolpartyTagIDs",
  "LocaleValidation",
  "localeValidation",
  "globaltolocal",
];

export default function ConfigScreen() {
  const sdk = useSDK();

  // `cmaToken` is what's in the input; `activeToken` is the one we've actually
  // built a client with (set on load and on save) so we don't fire a request
  // for every keystroke.
  const [cmaToken, setCmaToken] = useState("");
  const [activeToken, setActiveToken] = useState("");
  const [localesError, setLocalesError] = useState(null);

  const [locales, setLocales] = useState([]);
  const [defaultSourceLocale, setDefaultSourceLocale] = useState("");
  const [defaultTargetLocale, setDefaultTargetLocale] = useState("");
  const [allowedBases, setAllowedBases] = useState([...ALLOWED_BASES_DEFAULT]);
  const [pinnedTargets, setPinnedTargets] = useState([...PINNED_TARGET_LOCALES]);
  const [hiddenFields, setHiddenFields] = useState([...HIDDEN_FIELDS_DEFAULT]);
  const [newBase, setNewBase] = useState("");
  const [newPinned, setNewPinned] = useState("");
  const [newField, setNewField] = useState("");
  const [saveNote, setSaveNote] = useState(null);

  const buildParams = useCallback(
    () => ({
      cmaToken: cmaToken.trim() || null,
      defaultSourceLocale: defaultSourceLocale || null,
      defaultTargetLocale: defaultTargetLocale || null,
      allowedBases,
      pinnedTargets,
      hiddenFields,
    }),
    [cmaToken, defaultSourceLocale, defaultTargetLocale, allowedBases, pinnedTargets, hiddenFields],
  );

  useEffect(() => {
    sdk.app.onConfigure(async () => {
      const currentState = await sdk.app.getCurrentState();
      return { parameters: buildParams(), targetState: currentState };
    });
  }, [sdk, buildParams]);

  // Load saved parameters first — the CMA token lives there, and the locale
  // list below cannot be fetched without it.
  useEffect(() => {
    (async () => {
      const params = await sdk.app.getParameters();

      if (params) {
        if (params.cmaToken) {
          setCmaToken(params.cmaToken);
          setActiveToken(params.cmaToken);
        }
        if (params.defaultSourceLocale) setDefaultSourceLocale(params.defaultSourceLocale);
        if (params.defaultTargetLocale) setDefaultTargetLocale(params.defaultTargetLocale);
        if (Array.isArray(params.allowedBases)) setAllowedBases(params.allowedBases);
        if (Array.isArray(params.pinnedTargets)) setPinnedTargets(params.pinnedTargets);
        if (Array.isArray(params.hiddenFields)) setHiddenFields(params.hiddenFields);
      }

      sdk.app.setReady();
    })();
  }, [sdk]);

  // Fetch locales with whichever token is currently in effect. Doubles as
  // validation: a bad token surfaces here as a 401.
  useEffect(() => {
    if (!activeToken.trim()) {
      setLocales([]);
      setLocalesError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLocalesError(null);
      try {
        const cma = cmaSDK(sdk, activeToken);
        const res = await callCMA(() =>
          cma.locale.getMany({
            environmentId: sdk.ids.environment,
            spaceId: sdk.ids.space,
            query: { limit: 1000 },
          }),
        );
        if (!cancelled) setLocales(res.items);
      } catch (err) {
        if (cancelled) return;
        const status = err?.status ?? err?.response?.status;
        setLocales([]);
        setLocalesError(
          status === 401
            ? "Authentication failed (401) — this token is invalid or expired."
            : status === 403
              ? "Access denied (403) — this token lacks permission to read locales."
              : `Failed to load locales: ${err?.message ?? "unknown error"}`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sdk, activeToken]);

  const handleSave = async () => {
    try {
      await sdk.app.setParameters(buildParams());
      setActiveToken(cmaToken.trim());
      setSaveNote({ variant: "positive", text: "Configuration saved." });
    } catch {
      setSaveNote({ variant: "negative", text: "Failed to save. Please try again." });
    }
  };

  const addBase = () => {
    const trimmed = newBase.trim().toLowerCase();
    if (trimmed && !allowedBases.includes(trimmed)) {
      setAllowedBases((prev) => [...prev, trimmed]);
    }
    setNewBase("");
  };

  const removeBase = (base) =>
    setAllowedBases((prev) => prev.filter((b) => b !== base));

  const addPinned = () => {
    const trimmed = newPinned.trim();
    if (trimmed && !pinnedTargets.includes(trimmed)) {
      setPinnedTargets((prev) => [...prev, trimmed]);
    }
    setNewPinned("");
  };

  const removePinned = (code) =>
    setPinnedTargets((prev) => prev.filter((c) => c !== code));

  const addField = () => {
    const trimmed = newField.trim();
    if (trimmed && !hiddenFields.includes(trimmed)) {
      setHiddenFields((prev) => [...prev, trimmed]);
    }
    setNewField("");
  };

  const removeField = (field) =>
    setHiddenFields((prev) => prev.filter((f) => f !== field));

  const pillStyle = (color) => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    background: color === "red" ? "rgba(239,68,68,0.08)" : "rgba(99,102,241,0.1)",
    border: `1px solid ${color === "red" ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.3)"}`,
    borderRadius: 4, padding: "3px 10px", fontSize: 12, fontFamily: "monospace",
  });

  const removeBtn = {
    background: "none", border: "none", cursor: "pointer",
    color: "#666", padding: 0, lineHeight: 1,
  };

  return (
    <Flex flexDirection="column" style={{ margin: "80px auto", maxWidth: 800 }}>
      <Form>
        <Heading>Locale Populator — Configuration</Heading>

        {/* Management Token */}
        <div style={{ borderBottom: "1px solid #e5e5e5", paddingBottom: 24, marginBottom: 24 }}>
          <Heading as="h3">Contentful Management token</Heading>
          <Paragraph>
            The app reads and writes entries with this token — nothing else on this
            screen works until one is saved. Use a Personal Access Token with write
            access to this space, then save.
          </Paragraph>
          <TextInput
            type="password"
            value={cmaToken}
            onChange={(e) => setCmaToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="CFPAT-…"
            aria-label="Contentful Management token"
          />
          {!activeToken.trim() && (
            <Note variant="warning" style={{ marginTop: 12 }}>
              No token saved yet. The locale lists below stay empty, and the dialog will
              refuse to load for editors until a valid token is saved here.
            </Note>
          )}
          {localesError && (
            <Note variant="negative" style={{ marginTop: 12 }}>
              {localesError}
            </Note>
          )}
          <Paragraph style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            Stored in this app's installation parameters. Anyone who can read the app
            installation in this space can read the token — rotate it if that access
            changes.
          </Paragraph>
        </div>

        {/* Default Locales */}
        <div style={{ borderBottom: "1px solid #e5e5e5", paddingBottom: 24, marginBottom: 24 }}>
          <Heading as="h3">Default Locales</Heading>
          <Paragraph>Pre-selected when editors open the dialog.</Paragraph>
          <Stack flexDirection="row" spacing="spacingM" style={{ marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <Text fontWeight="fontWeightMedium">Default source locale</Text>
              <Select
                value={defaultSourceLocale}
                onChange={(e) => setDefaultSourceLocale(e.target.value)}
                style={{ marginTop: 4 }}
              >
                <Select.Option value="">None</Select.Option>
                {locales.map((l) => (
                  <Select.Option key={l.sys.id} value={l.code}>
                    {l.name} ({l.code})
                  </Select.Option>
                ))}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <Text fontWeight="fontWeightMedium">Default target locale</Text>
              <Select
                value={defaultTargetLocale}
                onChange={(e) => setDefaultTargetLocale(e.target.value)}
                style={{ marginTop: 4 }}
              >
                <Select.Option value="">None</Select.Option>
                {locales.map((l) => (
                  <Select.Option key={l.sys.id} value={l.code}>
                    {l.name} ({l.code})
                  </Select.Option>
                ))}
              </Select>
            </div>
          </Stack>
        </div>

        {/* Locale Pairing Rules */}
        <div style={{ borderBottom: "1px solid #e5e5e5", paddingBottom: 24, marginBottom: 24 }}>
          <Heading as="h3">Locale Pairing Rules</Heading>
          <Paragraph>
            By default all locale pairings are allowed. Add base language codes here to restrict — only source locales matching an entry will be permitted, and the target must share the same base.
            Disregarded locales are always permitted regardless of this list.
          </Paragraph>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {allowedBases.map((base) => (
              <span key={base} style={pillStyle("blue")}>
                {base}
                <button onClick={() => removeBase(base)} style={removeBtn} aria-label={`Remove ${base}`}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput
              placeholder="e.g. pt"
              value={newBase}
              onChange={(e) => setNewBase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBase()}
              size="small"
              style={{ width: 120 }}
            />
            <Button size="small" variant="secondary" onClick={addBase}>Add</Button>
          </div>
        </div>

        {/* Disregarded Locales */}
        <div style={{ borderBottom: "1px solid #e5e5e5", paddingBottom: 24, marginBottom: 24 }}>
          <Heading as="h3">Disregarded Locales</Heading>
          <Paragraph>
            These target locales are always allowed, regardless of source base language.
            Useful for locales like <code style={{ background: "#f3f3f3", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>zu-ZA</code> that aren't tied to a base.
          </Paragraph>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {pinnedTargets.map((code) => (
              <span key={code} style={pillStyle("blue")}>
                {code}
                <button onClick={() => removePinned(code)} style={removeBtn} aria-label={`Remove ${code}`}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Select
              value={newPinned}
              onChange={(e) => setNewPinned(e.target.value)}
              size="small"
              style={{ width: 220 }}
            >
              <Select.Option value="">— pick a locale —</Select.Option>
              {locales
                .filter((l) => !pinnedTargets.includes(l.code))
                .map((l) => (
                  <Select.Option key={l.sys.id} value={l.code}>
                    {l.name} ({l.code})
                  </Select.Option>
                ))}
            </Select>
            <Button size="small" variant="secondary" onClick={addPinned} isDisabled={!newPinned}>Add</Button>
          </div>
        </div>

        {/* Hidden Fields */}
        <div style={{ paddingBottom: 24, marginBottom: 24 }}>
          <Heading as="h3">Hidden Fields</Heading>
          <Paragraph>Field IDs excluded from the diff view.</Paragraph>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {hiddenFields.map((field) => (
              <span key={field} style={pillStyle("red")}>
                {field}
                <button onClick={() => removeField(field)} style={removeBtn} aria-label={`Remove ${field}`}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput
              placeholder="e.g. internalNote"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addField()}
              size="small"
              style={{ width: 200 }}
            />
            <Button size="small" variant="secondary" onClick={addField}>Add</Button>
          </div>
        </div>

        {saveNote && (
          <Note variant={saveNote.variant} style={{ marginBottom: 16 }}>
            {saveNote.text}
          </Note>
        )}

        <Button variant="primary" onClick={handleSave}>Save configuration</Button>
      </Form>
    </Flex>
  );
}
