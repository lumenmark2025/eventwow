import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function CategoryEditorModal({ open, onClose, initial, onSave }) {
  const isEdit = !!initial?.id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    display_name: "",
    slug: "",
    short_description: "",
    is_featured: false,
    featured_order: 0,
    is_active: true,
  });

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setError("");
    setForm({
      display_name: initial?.display_name || "",
      slug: initial?.slug || "",
      short_description: initial?.short_description || "",
      is_featured: !!initial?.is_featured,
      featured_order: Number(initial?.featured_order || 0),
      is_active: initial?.is_active !== false,
    });
  }, [open, initial]);

  const inlineError = useMemo(() => {
    if (!form.display_name.trim()) return "Display name is required.";
    if (!slugify(form.slug || form.display_name)) return "Valid slug is required.";
    if (!form.short_description.trim()) return "Short description is required.";
    if (form.display_name.trim().length > 80) return "Display name max is 80 chars.";
    if (form.short_description.trim().length > 180) return "Short description max is 180 chars.";
    return "";
  }, [form]);

  async function submit() {
    if (inlineError) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        display_name: form.display_name.trim(),
        slug: slugify(form.slug || form.display_name),
        short_description: form.short_description.trim(),
        is_featured: !!form.is_featured,
        featured_order: Number.isFinite(Number(form.featured_order)) ? Math.trunc(Number(form.featured_order)) : 0,
        is_active: !!form.is_active,
      };

      const path = isEdit ? `/api/admin/categories/${encodeURIComponent(initial.id)}` : "/api/admin/categories";
      const method = isEdit ? "PATCH" : "POST";
      const json = await apiFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSave?.(json?.row || null);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => (!saving ? onClose?.() : null)}
      title={isEdit ? "Edit category" : "Add category"}
      footer={(
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving || !!inlineError}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    >
      <div className="space-y-3">
        <Input
          value={form.display_name}
          onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
          placeholder="Display name"
        />
        <Input
          value={form.slug}
          onChange={(e) => setForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))}
          placeholder="Slug"
        />
        <textarea
          value={form.short_description}
          onChange={(e) => setForm((prev) => ({ ...prev, short_description: e.target.value }))}
          className="min-h-[100px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
          placeholder="Short description"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => setForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
          />
          Featured
        </label>
        {form.is_featured ? (
          <Input
            type="number"
            value={form.featured_order}
            onChange={(e) => setForm((prev) => ({ ...prev, featured_order: e.target.value }))}
            placeholder="Featured order"
          />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Active
        </label>
        {inlineError ? <p className="text-sm text-rose-600">{inlineError}</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function CategoriesPage() {
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("activeOnly", activeOnly ? "true" : "false");
      const json = await apiFetch(`/api/admin/categories?${params.toString()}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnly]);

  async function toggle(row, key, value) {
    setSavingId(`${key}:${row.id}`);
    setError("");
    setSuccess("");
    try {
      await apiFetch(`/api/admin/categories/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: value } : r)));
      setSuccess("Category updated.");
    } catch (err) {
      setError(err?.message || "Failed to update category");
    } finally {
      setSavingId("");
    }
  }

  async function deactivate(row) {
    setSavingId(`delete:${row.id}`);
    setError("");
    setSuccess("");
    try {
      await apiFetch(`/api/admin/categories/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: false } : r)));
      setSuccess("Category deactivated.");
    } catch (err) {
      setError(err?.message || "Failed to deactivate category");
    } finally {
      setSavingId("");
    }
  }

  async function reorderFeatured() {
    setSavingId("reorder");
    setError("");
    setSuccess("");
    try {
      const ordered = [...rows]
        .filter((r) => r.is_featured && r.is_active)
        .sort((a, b) => {
          const aOrder = Number(a.featured_order || 0);
          const bOrder = Number(b.featured_order || 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return String(a.display_name || "").localeCompare(String(b.display_name || ""));
        });
      const orderedIds = ordered.map((r) => r.id).filter(Boolean);
      if (orderedIds.length === 0) {
        setSuccess("No featured categories to reorder.");
        return;
      }
      await apiFetch("/api/admin/categories/reorder-featured", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_ids: orderedIds }),
      });
      await load();
      setSuccess("Featured ordering normalised.");
    } catch (err) {
      setError(err?.message || "Failed to reorder featured categories");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        subtitle="Manage supplier categories used on homepage and browse tiles."
        actions={[
          {
            key: "add",
            label: "Add category",
            onClick: () => {
              setEditing(null);
              setEditorOpen(true);
            },
          },
        ]}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      <Section
        title="Category list"
        right={(
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={reorderFeatured} disabled={savingId === "reorder"}>
              {savingId === "reorder" ? "Reordering..." : "Reorder featured"}
            </Button>
            <Badge variant="neutral">{rows.length}</Badge>
          </div>
        )}
      >
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or slug" className="sm:max-w-sm" />
              <Button type="button" variant="secondary" onClick={load}>Search</Button>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                Active only
              </label>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState title="No categories found" description="Create your first category." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Name</TH>
                      <TH>Slug</TH>
                      <TH>Short description</TH>
                      <TH>Featured</TH>
                      <TH>Order</TH>
                      <TH>Active</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD>{row.display_name}</TD>
                        <TD>{row.slug}</TD>
                        <TD className="max-w-[360px]">{row.short_description}</TD>
                        <TD>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!row.is_featured}
                              disabled={savingId === `feature:${row.id}`}
                              onChange={(e) => toggle(row, "is_featured", e.target.checked)}
                            />
                          </label>
                        </TD>
                        <TD>
                          <input
                            type="number"
                            className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-sm"
                            value={row.featured_order}
                            disabled={savingId === `order:${row.id}`}
                            onBlur={(e) => {
                              const next = Number.isFinite(Number(e.target.value)) ? Math.trunc(Number(e.target.value)) : 0;
                              if (next !== Number(row.featured_order || 0)) toggle(row, "featured_order", next);
                            }}
                            onChange={(e) => {
                              const next = e.target.value;
                              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, featured_order: next } : r)));
                            }}
                          />
                        </TD>
                        <TD>
                          <label className="inline-flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={row.is_active !== false}
                              disabled={savingId === `active:${row.id}`}
                              onChange={(e) => toggle(row, "is_active", e.target.checked)}
                            />
                          </label>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditing(row);
                                setEditorOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={savingId === `delete:${row.id}` || row.is_active === false}
                              onClick={() => deactivate(row)}
                            >
                              {row.is_active === false ? "Inactive" : "Deactivate"}
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <CategoryEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initial={editing}
        onSave={async () => {
          setSuccess(editing ? "Category saved." : "Category created.");
          await load();
        }}
      />
    </div>
  );
}

