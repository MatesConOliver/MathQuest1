export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">MathQuest1</h1>
      <p className="mt-2 opacity-70">
        Go to your <a className="underline" href="/character">Character Sheet</a>.
      </p>
      <p className="mt-2 opacity-70">
        Or <a className="underline" href="/login">login</a>.
      </p>
    </main>
  );
}
