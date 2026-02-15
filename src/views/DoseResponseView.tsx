import { ReactNode } from "react";

interface DoseResponseViewProps {
  children: ReactNode;
}

const DoseResponseView = ({ children }: DoseResponseViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default DoseResponseView;
