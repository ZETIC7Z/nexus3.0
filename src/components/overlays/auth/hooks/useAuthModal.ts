import { useCallback } from "react";
import { useOverlayStack } from "@/stores/interface/overlayStack";

export type AuthMode = "login" | "trust" | "register" | "passphrase" | "profile";

export function useAuthModal() {
  const { showModal, hideModal, isModalVisible } = useOverlayStack();
  const modalId = "auth";

  const openAuthModal = useCallback((initialMode: AuthMode = "login") => {
    sessionStorage.setItem("auth_modal_initial_mode", initialMode);
    window.dispatchEvent(
      new CustomEvent("open-auth-modal", { detail: { mode: initialMode } })
    );
    showModal(modalId);
  }, [showModal]);

  const closeAuthModal = useCallback(() => {
    hideModal(modalId);
  }, [hideModal]);

  const isAuthModalOpen = useCallback(() => {
    return isModalVisible(modalId);
  }, [isModalVisible]);

  return {
    openAuthModal,
    closeAuthModal,
    isAuthModalOpen,
  };
}
