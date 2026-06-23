import { useNavigate } from "react-router";

interface DirectoryButtonProps {
  className?: string;
  label?: string;
}

export function DirectoryButton({
  className = "",
  label = "Directory",
}: DirectoryButtonProps) {
  const navigate = useNavigate();

  // Every authenticated role uses the same protected directory route.
  function openDirectory(): void {
    navigate("/directory");
  }

  // The optional class name lets each dashboard adjust the button layout.
  const buttonClassName = [
    "directory-nav-button",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={openDirectory}
    >
      <span aria-hidden="true">
        ◉
      </span>

      {label}
    </button>
  );
}