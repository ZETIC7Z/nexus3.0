import { useOverlayStack } from "@/stores/interface/overlayStack";

export function useTipJar() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  const modalId = "tip-jar";

  return {
    openTipJar: () => showModal(modalId),
    closeTipJar: () => hideModal(modalId),
    isTipJarOpen: () => isModalVisible(modalId),
  };
}
