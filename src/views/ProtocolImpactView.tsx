import { ReactNode } from "react";

interface ProtocolImpactViewProps {
  children: ReactNode;
}

const ProtocolImpactView = ({ children }: ProtocolImpactViewProps) => {
  return <section className="space-y-3 fade-in">{children}</section>;
};

export default ProtocolImpactView;
