import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { AppLanguage } from "../types";
import { getMarkerMeta, trLocale } from "../i18n";
import { clampNumber } from "../chartHelpers";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

export interface MarkerInfoBadgeProps {
  marker: string;
  language: AppLanguage;
}

const MarkerInfoBadge = ({ marker, language }: MarkerInfoBadgeProps) => {
  const meta = getMarkerMeta(marker, language);
  const tr = (nl: string, en: string): string => trLocale(language, nl, en);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full p-0.5 text-slate-400 hover:text-cyan-200"
            aria-label={meta.title}
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-left" side="bottom">
          <div className="text-xs">
            <p className="font-semibold text-slate-100">{meta.title}</p>
            <p className="mt-1">{meta.what}</p>
            <p className="mt-1 text-slate-300">
              <strong>{tr("Waarom meten:", "Why measured:")}</strong> {meta.why}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p className="text-slate-300">
                <strong>{tr("Bij tekort/laag:", "If low:")}</strong> {meta.low}
              </p>
              <p className="text-slate-300">
                <strong>{tr("Bij teveel/hoog:", "If high:")}</strong> {meta.high}
              </p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MarkerInfoBadge;
