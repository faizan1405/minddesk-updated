import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/app/PageStates";
import { MindMapEditor } from "@/components/mindmap/MindMapEditor";
import { useMindMap } from "@/lib/mindmaps";

export const Route = createFileRoute("/_authenticated/mind-maps/$mapId")({ component: MapPage });

function MapPage() {
  const { mapId } = Route.useParams();
  const q = useMindMap(mapId);
  if (q.isPending) return <LoadingState />;
  if (q.error) return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <p className="font-medium">Couldn't open this mind map</p>
      <p className="mt-1 text-sm text-muted-foreground">{q.error.message}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" onClick={() => q.refetch()}>Try again</Button>
        <Button asChild variant="ghost"><Link to="/mind-maps">All mind maps</Link></Button>
      </div>
    </div>
  );
  return <MindMapEditor key={q.data.id} map={q.data} />;
}
