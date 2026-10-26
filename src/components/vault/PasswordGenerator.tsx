import React, { useState, useEffect, useCallback } from "react";
import { Copy, Check, RefreshCw, KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  generatePassword,
  evaluatePasswordStrength,
  type PasswordGeneratorOptions,
} from "@/lib/vault-crypto";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PasswordGeneratorProps {
  onUsePassword?: (password: string) => void;
  className?: string;
}

export function PasswordGenerator({ onUsePassword, className }: PasswordGeneratorProps) {
  const [options, setOptions] = useState<PasswordGeneratorOptions>({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });

  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const regenerate = useCallback(() => {
    const pw = generatePassword(options);
    setPassword(pw);
    setCopied(false);
  }, [options]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Generated password copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  const strength = evaluatePasswordStrength(password);

  const strengthColors: Record<string, string> = {
    weak: "bg-red-500",
    fair: "bg-amber-500",
    good: "bg-blue-500",
    strong: "bg-emerald-500",
    "very-strong": "bg-emerald-600",
  };

  return (
    <div className={cn("space-y-4 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold tracking-tight">Password Generator</h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold text-white",
            strengthColors[strength.strength] || "bg-primary",
          )}
        >
          {strength.label}
        </span>
      </div>

      {/* Generated password display */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5 font-mono text-sm break-all">
        <span className="flex-1 select-all tracking-wider text-foreground">{password}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 hover:bg-muted"
          onClick={regenerate}
          title="Regenerate"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-xs font-medium"
          onClick={copyToClipboard}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </div>

      {/* Strength indicator meter */}
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              step <= strength.score ? strengthColors[strength.strength] : "bg-muted",
            )}
          />
        ))}
      </div>

      {/* Length slider */}
      <div className="space-y-2 pt-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Length</span>
          <span className="font-semibold text-foreground">{options.length} characters</span>
        </div>
        <Slider
          value={[options.length]}
          min={8}
          max={64}
          step={1}
          onValueChange={([val]) => setOptions((prev) => ({ ...prev, length: val ?? 20 }))}
          className="py-1"
        />
      </div>

      {/* Character type checkboxes */}
      <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={options.uppercase}
            onCheckedChange={(checked) =>
              setOptions((prev) => ({ ...prev, uppercase: Boolean(checked) }))
            }
          />
          <span>Uppercase (A-Z)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={options.lowercase}
            onCheckedChange={(checked) =>
              setOptions((prev) => ({ ...prev, lowercase: Boolean(checked) }))
            }
          />
          <span>Lowercase (a-z)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={options.numbers}
            onCheckedChange={(checked) =>
              setOptions((prev) => ({ ...prev, numbers: Boolean(checked) }))
            }
          />
          <span>Numbers (0-9)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <Checkbox
            checked={options.symbols}
            onCheckedChange={(checked) =>
              setOptions((prev) => ({ ...prev, symbols: Boolean(checked) }))
            }
          />
          <span>Symbols (!@#$%)</span>
        </label>
      </div>

      {/* Use button */}
      {onUsePassword && (
        <Button
          type="button"
          className="w-full gap-2 text-xs font-medium"
          onClick={() => onUsePassword(password)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Use This Password
        </Button>
      )}
    </div>
  );
}
