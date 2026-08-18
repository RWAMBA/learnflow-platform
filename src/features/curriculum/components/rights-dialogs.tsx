import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveRightsGrant,
  saveSourceArtifact,
  saveVersionGovernance,
} from "@/lib/curriculum-rights.functions";
import {
  ACQUISITION_METHODS,
  ACTIVATION_STATUSES,
  CONTENT_READINESS,
  GRANT_TYPES,
  RIGHTS_STATUSES,
  SOURCE_TYPES,
  type CatalogueVersion,
} from "@/features/curriculum/rights-api";

function Shell({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

const LABELS: Record<string, string> = {
  official_document: "Official document",
  publisher_material: "Publisher material",
  open_licensed: "Openly licensed",
  learnflow_original: "LearnFlow original",
  other: "Other",
  unknown: "Unknown",
  official_download: "Official download",
  licensed_supply: "Licensed supply",
  direct_grant: "Direct grant",
  public_domain: "Public domain",
  learnflow_authored: "LearnFlow authored",
  open_licence: "Open licence",
  commercial_licence: "Commercial licence",
  written_permission: "Written permission",
  learnflow_owned: "LearnFlow owned",
  none: "None — no content loaded",
  partial: "Partial — incomplete content",
  complete: "Complete",
  review_required: "Review required",
  authorized: "Authorized",
  restricted: "Restricted",
  expired: "Expired",
  inactive: "Inactive — hidden from users",
  internal_preview: "Internal preview — staff only",
  active: "Active — offered to users",
};

export function humanLabel(value: string) {
  return LABELS[value] ?? value.replace(/_/g, " ");
}

function EnumField({
  control,
  name,
  label,
  values,
  description,
}: {
  // Shared across differently-typed forms.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  name: string;
  label: string;
  values: readonly string[];
  description?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {values.map((value) => (
                <SelectItem key={value} value={value}>
                  {humanLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/* ------------------------------------------------------- source artifact */

const artifactForm = z.object({
  rightsHolder: z.string().trim().min(2, "Name the rights holder").max(200),
  sourceTitle: z.string().trim().min(2, "Title is required").max(300),
  sourceType: z.enum(SOURCE_TYPES),
  authoritativeUrl: z.string().trim().url("Enter a full URL").max(2000).or(z.literal("")),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").or(z.literal("")),
  jurisdiction: z.string().trim().max(120),
  acquisitionMethod: z.enum(ACQUISITION_METHODS),
  edition: z.string().trim().max(120),
  checksum: z.string().trim().max(200),
  verificationStatus: z.enum(["unverified", "in_review", "verified", "rejected"]),
  notes: z.string().trim().max(2000),
});

export interface SourceArtifactDefaults {
  id?: string;
  rights_holder?: string;
  source_title?: string;
  source_type?: string;
  authoritative_url?: string | null;
  document_date?: string | null;
  jurisdiction?: string | null;
  acquisition_method?: string;
  edition?: string | null;
  checksum?: string | null;
  verification_status?: string;
  notes?: string | null;
}

export function SourceArtifactDialog({
  trigger,
  onSaved,
  artifact,
}: {
  trigger: ReactNode;
  onSaved: () => void;
  artifact?: SourceArtifactDefaults;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveSourceArtifact);
  const form = useForm<z.infer<typeof artifactForm>>({
    resolver: zodResolver(artifactForm),
    defaultValues: {
      rightsHolder: artifact?.rights_holder ?? "",
      sourceTitle: artifact?.source_title ?? "",
      sourceType: (artifact?.source_type as z.infer<typeof artifactForm>["sourceType"]) ?? "other",
      authoritativeUrl: artifact?.authoritative_url ?? "",
      documentDate: artifact?.document_date ?? "",
      jurisdiction: artifact?.jurisdiction ?? "",
      acquisitionMethod:
        (artifact?.acquisition_method as z.infer<typeof artifactForm>["acquisitionMethod"]) ??
        "unknown",
      edition: artifact?.edition ?? "",
      checksum: artifact?.checksum ?? "",
      verificationStatus:
        (artifact?.verification_status as z.infer<typeof artifactForm>["verificationStatus"]) ??
        "unverified",
      notes: artifact?.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof artifactForm>) =>
      save({
        data: {
          ...(artifact?.id ? { id: artifact.id } : {}),
          rightsHolder: values.rightsHolder,
          sourceTitle: values.sourceTitle,
          sourceType: values.sourceType,
          authoritativeUrl: values.authoritativeUrl || null,
          documentDate: values.documentDate || null,
          jurisdiction: values.jurisdiction || null,
          acquisitionMethod: values.acquisitionMethod,
          edition: values.edition || null,
          checksum: values.checksum || null,
          originalArtifactPath: null,
          verificationStatus: values.verificationStatus,
          notes: values.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Source recorded");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={artifact?.id ? "Edit source" : "Record a curriculum source"}
      description="Provenance for curriculum material. Recording a source does not authorize its use — that needs a reviewed rights grant."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <FormField
            control={form.control}
            name="sourceTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source title</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rightsHolder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rights holder</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <EnumField control={form.control} name="sourceType" label="Source type" values={SOURCE_TYPES} />
            <EnumField
              control={form.control}
              name="acquisitionMethod"
              label="How it was obtained"
              values={ACQUISITION_METHODS}
            />
          </div>
          <FormField
            control={form.control}
            name="authoritativeUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Authoritative URL</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="url" placeholder="https://" />
                </FormControl>
                <FormDescription>Where the original document is published.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="documentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Document date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jurisdiction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jurisdiction</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Kenya" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="edition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Edition</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="checksum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Checksum</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="sha256:…" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <EnumField
            control={form.control}
            name="verificationStatus"
            label="Verification"
            values={["unverified", "in_review", "verified", "rejected"]}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={3} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save source"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ---------------------------------------------------------- rights grant */

const PERMISSIONS = [
  ["permitsCommercialUse", "Commercial use"],
  ["permitsStorage", "Storage in LearnFlow"],
  ["permitsTransformation", "Transformation"],
  ["permitsAuthenticatedDisplay", "Display to signed-in users"],
  ["permitsPublicDisplay", "Public display"],
  ["permitsDownload", "Learner download"],
  ["permitsTranslation", "Translation"],
  ["permitsDerivativeWorks", "Derivative works"],
  ["permitsSublicensing", "Sublicensing"],
] as const;

const grantForm = z.object({
  grantType: z.enum(GRANT_TYPES),
  grantReference: z.string().trim().max(200),
  evidenceStoragePath: z.string().trim().max(500),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").or(z.literal("")),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").or(z.literal("")),
  territory: z.string().trim().max(200),
  attributionText: z.string().trim().max(500),
  restrictions: z.string().trim().max(2000),
  markReviewed: z.boolean(),
  permitsCommercialUse: z.boolean(),
  permitsStorage: z.boolean(),
  permitsTransformation: z.boolean(),
  permitsAuthenticatedDisplay: z.boolean(),
  permitsPublicDisplay: z.boolean(),
  permitsDownload: z.boolean(),
  permitsTranslation: z.boolean(),
  permitsDerivativeWorks: z.boolean(),
  permitsSublicensing: z.boolean(),
});

export function RightsGrantDialog({
  trigger,
  sourceArtifactId,
  onSaved,
}: {
  trigger: ReactNode;
  sourceArtifactId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveRightsGrant);
  const form = useForm<z.infer<typeof grantForm>>({
    resolver: zodResolver(grantForm),
    defaultValues: {
      grantType: "unknown",
      grantReference: "",
      evidenceStoragePath: "",
      effectiveDate: "",
      expiryDate: "",
      territory: "",
      attributionText: "",
      restrictions: "",
      markReviewed: false,
      permitsCommercialUse: false,
      permitsStorage: false,
      permitsTransformation: false,
      permitsAuthenticatedDisplay: false,
      permitsPublicDisplay: false,
      permitsDownload: false,
      permitsTranslation: false,
      permitsDerivativeWorks: false,
      permitsSublicensing: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof grantForm>) =>
      save({
        data: {
          sourceArtifactId,
          grantType: values.grantType,
          grantReference: values.grantReference || null,
          evidenceStoragePath: values.evidenceStoragePath || null,
          effectiveDate: values.effectiveDate || null,
          expiryDate: values.expiryDate || null,
          territory: values.territory || null,
          attributionText: values.attributionText || null,
          restrictions: values.restrictions || null,
          markReviewed: values.markReviewed,
          permitsCommercialUse: values.permitsCommercialUse,
          permitsStorage: values.permitsStorage,
          permitsTransformation: values.permitsTransformation,
          permitsAuthenticatedDisplay: values.permitsAuthenticatedDisplay,
          permitsPublicDisplay: values.permitsPublicDisplay,
          permitsDownload: values.permitsDownload,
          permitsTranslation: values.permitsTranslation,
          permitsDerivativeWorks: values.permitsDerivativeWorks,
          permitsSublicensing: values.permitsSublicensing,
        },
      }),
    onSuccess: () => {
      toast.success("Rights grant recorded");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Record a rights grant"
      description="A curriculum version only becomes authorized when a reviewed, in-date grant permits storage, commercial use and display to signed-in users."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <EnumField control={form.control} name="grantType" label="Grant type" values={GRANT_TYPES} />
          <FormField
            control={form.control}
            name="grantReference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Licence or agreement reference" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="effectiveDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Effective from</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expires</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="territory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Territory</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Worldwide" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="evidenceStoragePath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Evidence reference</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Where the signed licence is filed" />
                </FormControl>
                <FormDescription>
                  Reference only — licence documents are held outside the learner-facing app.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="attributionText"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Required attribution</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="restrictions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Restrictions</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Permissions granted</legend>
            {PERMISSIONS.map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <FormLabel className="font-normal">{label}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </fieldset>

          <FormField
            control={form.control}
            name="markReviewed"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div>
                  <FormLabel className="font-normal">Mark as reviewed by me</FormLabel>
                  <FormDescription>
                    Attributed to your account and timestamped by the server.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save grant"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}

/* ------------------------------------------------------ version governance */

const governanceForm = z.object({
  contentReadiness: z.enum(CONTENT_READINESS),
  rightsStatus: z.enum(RIGHTS_STATUSES),
  activationStatus: z.enum(ACTIVATION_STATUSES),
  availabilityNote: z.string().trim().max(300),
});

export function VersionGovernanceDialog({
  trigger,
  version,
  onSaved,
}: {
  trigger: ReactNode;
  version: CatalogueVersion;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const save = useServerFn(saveVersionGovernance);
  const form = useForm<z.infer<typeof governanceForm>>({
    resolver: zodResolver(governanceForm),
    defaultValues: {
      contentReadiness: version.content_readiness,
      rightsStatus: version.rights_status,
      activationStatus: version.activation_status,
      availabilityNote: version.availability_note ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof governanceForm>) =>
      save({
        data: {
          versionId: version.id,
          contentReadiness: values.contentReadiness,
          rightsStatus: values.rightsStatus,
          activationStatus: values.activationStatus,
          availabilityNote: values.availabilityNote || null,
        },
      }),
    onSuccess: () => {
      toast.success("Availability decision recorded");
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Shell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={`Availability — ${version.label}`}
      description="The database refuses an authorized status without a qualifying reviewed grant, and refuses activation without authorized rights and complete content."
    >
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <EnumField
            control={form.control}
            name="contentReadiness"
            label="Content readiness"
            values={CONTENT_READINESS}
          />
          <EnumField
            control={form.control}
            name="rightsStatus"
            label="Rights status"
            values={RIGHTS_STATUSES}
          />
          <EnumField
            control={form.control}
            name="activationStatus"
            label="Activation"
            values={ACTIVATION_STATUSES}
          />
          <FormField
            control={form.control}
            name="availabilityNote"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Internal availability note</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} />
                </FormControl>
                <FormDescription>
                  Shown to platform administrators only — never to learners or organizations.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save decision"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </Shell>
  );
}
