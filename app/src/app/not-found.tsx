/**
 * 404. Short on purpose: the only useful thing here is the way back.
 */
export default function NotFound() {
  return (
    <main className="page">
      <h1>Not here.</h1>
      <p className="note"><a href="/">Back to the pantry</a></p>
    </main>
  );
}
