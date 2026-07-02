import { useNavigate } from "react-router";

interface MessageButtonProps {
  className?: string;
  label?: string;
}

export function MessageButton({
  className = "",
  label = "Messages",
}: MessageButtonProps) {
  const navigate = useNavigate();

  function openMessages(): void {
    navigate("/messages");
  }

  const buttonClassName = [
    "message-nav-button",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={openMessages}
    >
      <span aria-hidden="true">
        ✉
      </span>

      {label}
    </button>
  );
}
