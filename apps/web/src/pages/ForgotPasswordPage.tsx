import { Link } from "react-router";

export function ForgotPasswordPage() {
  return (
    <main className="simple-page">
      <section className="simple-card">
        <h1>Forgot password</h1>

        <p>
          Password recovery using your
          official email and OTP will be
          added in the next task.
        </p>

        <Link
          className="primary-link"
          to="/login"
        >
          Return to login
        </Link>
      </section>
    </main>
  );
}