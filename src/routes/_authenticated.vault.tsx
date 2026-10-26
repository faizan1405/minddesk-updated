import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  KeyRound,
  FileCheck2,
  Plus,
  Search,
  Sparkles,
  Lock,
  FolderOpen,
  Filter,
  ArrowUpDown,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  VaultProvider,
  useVault,
  type DecryptedPasswordItem,
  type DecryptedDocumentItem,
} from "@/components/vault/VaultContext";
import { VaultUnlockScreen } from "@/components/vault/VaultUnlockScreen";
import { VaultHeader } from "@/components/vault/VaultHeader";
import { PasswordCard } from "@/components/vault/PasswordCard";
import { PasswordDialog } from "@/components/vault/PasswordDialog";
import { PasswordGenerator } from "@/components/vault/PasswordGenerator";
import { DocumentCard } from "@/components/vault/DocumentCard";
import { DocumentDialog, DOCUMENT_PRESET_CATEGORIES } from "@/components/vault/DocumentDialog";
import { DocumentViewerModal } from "@/components/vault/DocumentViewerModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/vault")({
  component: VaultPageWrapper,
});

function VaultPageWrapper() {
  return (
    <VaultProvider>
      <VaultMainContent />
    </VaultProvider>
  );
}

function VaultMainContent() {
  const { status, passwords, documents, isLoadingData } = useVault();

  // Tab: "passwords" | "documents"
  const [activeTab, setActiveTab] = useState<"passwords" | "documents">("passwords");

  // Passwords state
  const [passwordSearch, setPasswordSearch] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [editingPassword, setEditingPassword] = useState<DecryptedPasswordItem | null>(null);
  const [quickGeneratorOpen, setQuickGeneratorOpen] = useState(false);

  // Documents state
  const [docSearch, setDocSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "expiry">("updated");
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DecryptedDocumentItem | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DecryptedDocumentItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Filtered Passwords
  const filteredPasswords = useMemo(() => {
    if (!passwordSearch.trim()) return passwords;
    const q = passwordSearch.toLowerCase();
    return passwords.filter(
      (p) =>
        p.data.name.toLowerCase().includes(q) ||
        p.data.username.toLowerCase().includes(q) ||
        (p.data.url && p.data.url.toLowerCase().includes(q)) ||
        (p.data.notes && p.data.notes.toLowerCase().includes(q)),
    );
  }, [passwords, passwordSearch]);

  // Filtered & Sorted Documents
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Category filter
    if (selectedCategory !== "All") {
      result = result.filter((d) => d.data.category === selectedCategory);
    }

    // Search query
    if (docSearch.trim()) {
      const q = docSearch.toLowerCase();
      result = result.filter(
        (d) =>
          d.data.title.toLowerCase().includes(q) ||
          d.data.category.toLowerCase().includes(q) ||
          (d.data.documentNumber && d.data.documentNumber.toLowerCase().includes(q)) ||
          (d.data.notes && d.data.notes.toLowerCase().includes(q)) ||
          (d.data.tags && d.data.tags.some((t) => t.toLowerCase().includes(q))),
      );
    }

    // Sort
    return [...result].sort((a, b) => {
      if (sortBy === "title") {
        return a.data.title.localeCompare(b.data.title);
      }
      if (sortBy === "expiry") {
        if (!a.data.expiryDate) return 1;
        if (!b.data.expiryDate) return -1;
        return new Date(a.data.expiryDate).getTime() - new Date(b.data.expiryDate).getTime();
      }
      // default: updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [documents, selectedCategory, docSearch, sortBy]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "uninitialized" || status === "locked") {
    return <VaultUnlockScreen />;
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <VaultHeader />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <TabsList className="h-10 p-1 bg-muted/60">
            <TabsTrigger value="passwords" className="gap-2 text-xs font-semibold px-4">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Passwords</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {passwords.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2 text-xs font-semibold px-4">
              <FileCheck2 className="h-3.5 w-3.5" />
              <span>Documents</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                {documents.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ===================== TAB 1: PASSWORDS ===================== */}
        <TabsContent value="passwords" className="space-y-4 pt-2">
          {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search passwords, accounts, or notes..."
                value={passwordSearch}
                onChange={(e) => setPasswordSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs font-medium"
                onClick={() => setQuickGeneratorOpen(true)}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Password Generator</span>
              </Button>

              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold shadow-sm"
                onClick={() => {
                  setEditingPassword(null);
                  setPasswordDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Add Password</span>
              </Button>
            </div>
          </div>

          {/* Passwords Grid / Empty State */}
          {isLoadingData ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Decrypting passwords...</p>
            </div>
          ) : filteredPasswords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed p-8 bg-muted/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <KeyRound className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {passwordSearch ? "No matching passwords found" : "No passwords saved in your vault"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                {passwordSearch
                  ? "Try searching for a different account name, username, or private note."
                  : "Safely store credentials for Instagram, Hostinger, Gmail, GitHub, or any other online service."}
              </p>
              {!passwordSearch && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingPassword(null);
                    setPasswordDialogOpen(true);
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Password
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPasswords.map((item) => (
                <PasswordCard
                  key={item.id}
                  item={item}
                  onEdit={(p) => {
                    setEditingPassword(p);
                    setPasswordDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===================== TAB 2: DOCUMENTS ===================== */}
        <TabsContent value="documents" className="space-y-4 pt-2">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory("All")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                selectedCategory === "All"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              All Documents ({documents.length})
            </button>
            {DOCUMENT_PRESET_CATEGORIES.map((cat) => {
              const count = documents.filter((d) => d.data.category === cat).length;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Action & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search documents by name, category, number, or notes..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Sort Selector */}
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="h-9 text-xs w-[150px]">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated" className="text-xs">Recently Updated</SelectItem>
                  <SelectItem value="title" className="text-xs">Name (A-Z)</SelectItem>
                  <SelectItem value="expiry" className="text-xs">Expiry Date</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold shadow-sm"
                onClick={() => {
                  setEditingDoc(null);
                  setDocumentDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Add Document</span>
              </Button>
            </div>
          </div>

          {/* Documents Grid / Empty State */}
          {isLoadingData ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Decrypting documents...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed p-8 bg-muted/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {docSearch || selectedCategory !== "All"
                  ? "No matching documents found"
                  : "No documents stored in your vault"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                {docSearch || selectedCategory !== "All"
                  ? "Try adjusting your search query or selecting a different category."
                  : "Securely upload and organize Aadhaar, Driving Licence, PAN, degree certificates, vehicle RC, and insurance files."}
              </p>
              {!docSearch && selectedCategory === "All" && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingDoc(null);
                    setDocumentDialogOpen(true);
                  }}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Document
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDocuments.map((item) => (
                <DocumentCard
                  key={item.id}
                  item={item}
                  onView={(doc) => {
                    setViewingDoc(doc);
                    setViewerOpen(true);
                  }}
                  onEdit={(doc) => {
                    setEditingDoc(doc);
                    setDocumentDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs & Viewers */}
      <PasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        editingItem={editingPassword}
      />

      <DocumentDialog
        open={documentDialogOpen}
        onOpenChange={setDocumentDialogOpen}
        editingItem={editingDoc}
      />

      <DocumentViewerModal
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={viewingDoc}
      />

      {/* Quick Standalone Password Generator Dialog */}
      <Dialog open={quickGeneratorOpen} onOpenChange={setQuickGeneratorOpen}>
        <DialogContent className="sm:max-w-md p-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Password Generator</DialogTitle>
            <DialogDescription className="text-xs">
              Cryptographically secure random password generation using WebCrypto.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <PasswordGenerator />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
