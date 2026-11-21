export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 py-6 sm:px-8">
      <p className="text-sm text-muted-foreground">분석을 불러오는 중이에요.</p>
      <div className="h-28 animate-pulse rounded-xl bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="h-40 animate-pulse rounded-xl bg-muted" />
    </main>
  );
}
