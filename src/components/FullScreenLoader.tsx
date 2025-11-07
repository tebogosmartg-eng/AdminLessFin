import { Loader2 } from "lucide-react";

const FullScreenLoader = () => {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
};

export default FullScreenLoader;