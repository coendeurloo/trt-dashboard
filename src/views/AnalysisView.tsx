import { ReactNode } from "react";

interface AnalysisViewProps {
  children: ReactNode;
}

const AnalysisView = ({ children }: AnalysisViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default AnalysisView;
