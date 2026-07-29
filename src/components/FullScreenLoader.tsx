import { AppLoadingLogo } from "./brand";

const FullScreenLoader = () => {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <AppLoadingLogo />
    </div>
  );
};

export default FullScreenLoader;