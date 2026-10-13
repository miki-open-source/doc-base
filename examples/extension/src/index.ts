import { defineExtension } from "@doc-base/extension-api";
export default defineExtension({
  apiVersion: "1",
  name: "Example metadata",
  setup(api) {
    api.validation.registerRule({
      code: "DBX100",
      defaultSeverity: "warning",
      description: "Avoid unfinished page titles",
      run(context) {
        return context.documents
          .filter((document) => document.title === "TODO")
          .map((document) => ({
            message: "Choose a descriptive title",
            documentKey: document.key,
            file: document.sourcePath,
            sourceId: document.sourceId,
          }));
      },
    });
    api.metadata.registerPresenter({
      key: "owner",
      label: "Owner",
      placement: "footer",
      present(value) {
        return typeof value === "string" ? { kind: "text", text: value } : null;
      },
    });
  },
});
