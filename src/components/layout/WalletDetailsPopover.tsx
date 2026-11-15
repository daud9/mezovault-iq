import { useId, type ReactNode } from "react";

interface WalletDetailsPopoverProps {
  className?: string;
  open: boolean;
  onToggle(): void;
  buttonClassName: string;
  buttonContent: ReactNode;
  panelClassName: string;
  children: ReactNode;
}

/** A connected-wallet disclosure with a unique trigger-to-panel relationship. */
export function WalletDetailsPopover({
  className = "",
  open,
  onToggle,
  buttonClassName,
  buttonContent,
  panelClassName,
  children,
}: WalletDetailsPopoverProps) {
  const panelId = useId();

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={buttonClassName}
      >
        {buttonContent}
      </button>
      {open && (
        <div id={panelId} role="region" aria-label="Wallet details" className={panelClassName}>
          {children}
        </div>
      )}
    </div>
  );
}
