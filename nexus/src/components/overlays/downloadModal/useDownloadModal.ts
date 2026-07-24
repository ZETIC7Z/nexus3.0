import { useOverlayStack } from "@/stores/interface/overlayStack";

export function useDownloadModal() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  const modalId = "download";

  return {
    openDownloadModal: () => showModal(modalId),
    closeDownloadModal: () => hideModal(modalId),
    isDownloadModalOpen: () => isModalVisible(modalId),
  };
}
