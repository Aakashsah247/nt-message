import { useNavigate } from "react-router";

export function ManagementPositionsButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="directory-nav-button"
      onClick={() =>
        navigate(
          "/super-admin/management-positions",
        )
      }
    >
      <span aria-hidden="true">
        M
      </span>

      Management positions
    </button>
  );
}
