export type UploadTriggerAction = "scroll-to-panel" | "open-hidden-picker" | "noop";

interface ResolveUploadTriggerActionInput {
  isShareMode: boolean;
  hasUploadPanel: boolean;
  isProcessing: boolean;
}

export const resolveUploadTriggerAction = ({
  isShareMode,
  hasUploadPanel,
  isProcessing
}: ResolveUploadTriggerActionInput): UploadTriggerAction => {
  if (isShareMode) {
    return "noop";
  }
  if (hasUploadPanel) {
    return "scroll-to-panel";
  }
  if (isProcessing) {
    return "noop";
  }
  return "open-hidden-picker";
};
