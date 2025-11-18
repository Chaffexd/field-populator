import React from "react";
import { Button, Paragraph } from "@contentful/f36-components";
import { useCMA, useSDK } from "@contentful/react-apps-toolkit";

const Sidebar = () => {
  const sdk = useSDK();
  const cma = useCMA();

  sdk.window.startAutoResizer();

  const openDialog = () => {
    sdk.dialogs.openCurrent({
      title: "Master Language Adopter",
      width: "1200px",
      minHeight: "600px",
      parameters: {
        entryId: sdk.ids.entry,
        environmentId: sdk.ids.environment,
        spaceId: sdk.ids.space,
      },
    });
  };

  return (
    <Button variant="primary" style={{ width: "100%" }} onClick={openDialog}>
      Open Dialog
    </Button>
  );
};

export default Sidebar;
