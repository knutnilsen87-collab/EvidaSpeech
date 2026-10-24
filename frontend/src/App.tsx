import { ComponentGallery } from "./ComponentGallery";
import { BuildStamp } from "./ui";

export function App() {
  return (
    <div className="ev-app">
      <ComponentGallery />
      <footer className="ev-app__footer">
        <BuildStamp />
      </footer>
    </div>
  );
}
