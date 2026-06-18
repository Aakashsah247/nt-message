import {
  Link,
} from "react-router";

export function ActivationPage() {
  return (
    <main className="simple-page">
      <div className="simple-card">
        <div className="brand-mark">
          NT
        </div>

        <h1>Activate account</h1>

        <p>
          The employee activation form,
          OTP verification and password
          setup will be added in the next
          task.
        </p>

        <Link
          className="primary-link"
          to="/login"
        >
          Return to login
        </Link>
      </div>
    </main>
  );
}