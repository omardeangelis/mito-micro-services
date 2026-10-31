import { useState } from "react"
import { useForm } from "react-hook-form"
import { PlusIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "sonner"
import {
  BadgeDelta,
  BarChart,
  Card as ChartCard,
  DeltaBar,
  DonutChart,
  ProgressCircle,
} from "@/components/charts"
import { PriorityBadge } from "@/components/custom/badge/priority"
import { TaskStatusBadge } from "@/components/custom/badge/TaskStatusBadge"
import { importTone, productTone, type Tone } from "@/lib/tones"
import { BlackListBadge } from "@/routes/dashboard/customers/_components/BlackListBadge"
import { statusLabels } from "@/routes/dashboard/import/_components/format"
import { type BlackListStatus } from "@mito/contract/customer"
import { type ProductMapType } from "@mito/domain/constants/productMap"
import { allStates } from "@mito/domain/contact/status"
import { bandValue, priorityBands } from "@mito/domain/contact/priority"

// Every token and component state of the design system, on React 19 and
// Tailwind 4 (AC22): the page the browser check reads. Only in development
// (src/router.tsx)

const tones: Tone[] = [
  "blue",
  "indigo",
  "magenta",
  "orange",
  "amber",
  "teal",
  "green",
  "red",
  "neutral",
]

// The tokens of appendix A, in its order; each is the CSS variable `--<name>`
const tokens = [
  "background",
  "card",
  "popover",
  "foreground",
  "card-foreground",
  "popover-foreground",
  "secondary-foreground",
  "accent-foreground",
  "muted",
  "secondary",
  "muted-foreground",
  "subtle",
  "accent",
  "primary",
  "primary-hover",
  "primary-foreground",
  "primary-soft",
  "primary-soft-border",
  "primary-soft-foreground",
  "link",
  "ring",
  "ring-soft",
  "success",
  "success-soft",
  "success-soft-border",
  "success-soft-foreground",
  "warning",
  "warning-soft",
  "warning-soft-border",
  "warning-soft-foreground",
  "destructive",
  "destructive-hover",
  "destructive-foreground",
  "destructive-text",
  "destructive-ring",
  "destructive-soft",
  "destructive-soft-border",
  "destructive-soft-foreground",
  "border",
  "border-strong",
  "input",
  "input-hover",
  "control",
  "tooltip",
  "tooltip-foreground",
  "sidebar",
  "sidebar-foreground",
  "sidebar-muted",
  "sidebar-accent",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "chart-1",
  "chart-1-soft",
  "overlay",
]

// Appendix B: four variables for each tone
const toneTokens = tones.flatMap((tone) =>
  ["bg", "border", "text", "dot"].map((part) => `tag-${tone}-${part}`)
)

const blacklistStates: BlackListStatus[] = [
  "blacklisted",
  "review",
  "whitelisted",
]

const importStatuses = Object.keys(
  statusLabels
) as (keyof typeof statusLabels)[]

const productTypes: (ProductMapType | undefined)[] = [
  "Personale",
  "auto",
  "Finalizzato",
  undefined,
]

const buttonVariants = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
  "disabled",
] as const

const buttonSizes = ["default", "xs", "sm", "lg"] as const
const iconSizes = ["icon", "icon-xs", "icon-sm", "icon-lg"] as const

// One button per kind of toast; the label keeps the name of the variant
const toastByVariant = {
  default: toast,
  success: toast.success,
  info: toast.info,
  destructive: toast.error,
} as const

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section className="rounded-card space-y-3 border bg-card p-4">
    <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
    <div className="flex flex-wrap items-start gap-3">{children}</div>
  </section>
)

/** A sample with the name of what it shows under it */
const Sample = ({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col items-start gap-1.5">
    {children}
    <span className="text-xs text-muted-foreground">{name}</span>
  </div>
)

/** The swatch of a token: its fill and its name */
const Swatch = ({ token }: { token: string }) => (
  <div className="flex items-center gap-2">
    <span
      data-token={token}
      className="rounded-control border-border-strong size-7 shrink-0 border"
      style={{ background: `var(--${token})` }}
    />
    <span className="text-xs">{token}</span>
  </div>
)

const ExampleForm = () => {
  const form = useForm<{ name: string }>({ defaultValues: { name: "" } })
  return (
    <Form {...form}>
      <form
        className="w-80 space-y-3"
        onSubmit={form.handleSubmit(() => undefined)}
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Il nome è obbligatorio" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Mario Rossi" {...field} />
              </FormControl>
              <FormDescription>Come appare nella lista clienti</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Salva</Button>
      </form>
    </Form>
  )
}

export function UiShowcase() {
  const [date, setDate] = useState<Date | undefined>(new Date(2026, 9, 27))

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Componenti UI</h1>

      <section className="rounded-card space-y-3 border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Token</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-x-4 gap-y-2">
          {[...tokens, ...toneTokens].map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </section>

      <Section title="Button">
        {buttonVariants.map((variant) => (
          <div
            key={variant}
            className="flex w-full flex-wrap items-center gap-3"
          >
            <span className="w-24 text-xs text-muted-foreground">
              {variant}
            </span>
            {buttonSizes.map((size) => (
              <Button key={size} variant={variant} size={size}>
                {size}
              </Button>
            ))}
            {iconSizes.map((size) => (
              <Button
                key={size}
                variant={variant}
                size={size}
                aria-label={`${variant} ${size}`}
              >
                <PlusIcon />
              </Button>
            ))}
          </div>
        ))}
        <div className="flex w-full flex-wrap items-center gap-3">
          <span className="w-24 text-xs text-muted-foreground">attribute</span>
          <Button disabled>Disabled attribute</Button>
          <Button variant="outline" disabled>
            Outline disabled
          </Button>
        </div>
      </Section>

      <Section title="Badge">
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge size="xs">xs</Badge>
        <Badge size="lg">lg</Badge>
      </Section>

      <Section title="Significati dei toni">
        {allStates.map((state) => (
          <TaskStatusBadge key={state} status={state} />
        ))}
        {blacklistStates.map((state) => (
          <Sample key={state} name={state}>
            <BlackListBadge state={state} />
          </Sample>
        ))}
        {importStatuses.map((status) => (
          <Badge key={status} tone={importTone(status)}>
            {statusLabels[status]}
          </Badge>
        ))}
        {productTypes.map((type) => (
          <Sample key={type ?? "other"} name={`product ${type ?? "other"}`}>
            <Badge tone={productTone(type)}>{type ?? "Altro"}</Badge>
          </Sample>
        ))}
      </Section>

      <Section title="Priorità">
        {priorityBands.map((band) => (
          <Sample key={band} name={band}>
            <PriorityBadge priority={bandValue(band)} />
          </Sample>
        ))}
      </Section>

      <Section title="Alert">
        <Alert className="w-80">
          <AlertTitle>Default</AlertTitle>
          <AlertDescription>Un messaggio per l&apos;utente</AlertDescription>
        </Alert>
        <Alert variant="destructive" className="w-80">
          <AlertTitle>Destructive</AlertTitle>
          <AlertDescription>Qualcosa non va</AlertDescription>
        </Alert>
        <Alert variant="success" className="w-80">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Fatto</AlertDescription>
        </Alert>
        <Alert variant="info" className="w-80">
          <AlertTitle>Info</AlertTitle>
          <AlertDescription>Da sapere</AlertDescription>
        </Alert>
      </Section>

      <Section title="Card, Avatar, Skeleton">
        <Card className="w-72">
          <CardHeader>
            <CardTitle>Clienti</CardTitle>
            <CardDescription>Ultimi 30 giorni</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">1.284</CardContent>
        </Card>
        <Avatar>
          <AvatarFallback>MR</AvatarFallback>
        </Avatar>
        <div className="w-48 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Section>

      <Section title="Campi: i cinque stati di AC11">
        <div className="w-64 space-y-2">
          <Label htmlFor="field-rest">Riposo</Label>
          <Input id="field-rest" placeholder="nome@esempio.it" />
        </div>
        <div className="w-64 space-y-2">
          <Label htmlFor="field-hover">Hover (classe dello stato)</Label>
          <Input
            id="field-hover"
            className="border-input-hover"
            placeholder="nome@esempio.it"
          />
        </div>
        <div className="w-64 space-y-2">
          <Label htmlFor="field-focus">Focus (classi dello stato)</Label>
          <Input
            id="field-focus"
            className="ring-ring-soft border-ring ring-[3px]"
            placeholder="nome@esempio.it"
          />
        </div>
        <div className="w-64 space-y-2">
          <Label htmlFor="field-error">Errore (aria-invalid)</Label>
          <Input
            id="field-error"
            aria-invalid="true"
            defaultValue="non è una email"
          />
        </div>
        <div className="w-64 space-y-2">
          <Label htmlFor="field-disabled">Disabilitato</Label>
          <Input id="field-disabled" disabled placeholder="nome@esempio.it" />
        </div>
        <div className="w-64 space-y-2">
          <Label htmlFor="field-try">Da provare con mouse e tastiera</Label>
          <Input id="field-try" placeholder="nome@esempio.it" />
        </div>
        <Textarea className="w-64" placeholder="Una nota" />
        <Textarea className="w-64" aria-invalid="true" defaultValue="Errore" />
        <Textarea className="w-64" disabled placeholder="Disabilitato" />
      </Section>

      <Section title="Checkbox, radio, switch">
        <div className="flex items-center gap-2">
          <Checkbox id="check-on" defaultChecked />
          <Label htmlFor="check-on">Checkbox acceso</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="check-off" />
          <Label htmlFor="check-off">Checkbox spento</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="check-mixed" checked="indeterminate" />
          <Label htmlFor="check-mixed">Checkbox misto</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="check-disabled" disabled />
          <Label htmlFor="check-disabled">Checkbox disabilitato</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch-on" defaultChecked />
          <Label htmlFor="switch-on">Switch acceso</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch-off" />
          <Label htmlFor="switch-off">Switch spento</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch-disabled" disabled />
          <Label htmlFor="switch-disabled">Switch disabilitato</Label>
        </div>
        <RadioGroup defaultValue="a">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="a" id="radio-on" />
            <Label htmlFor="radio-on">Radio acceso</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="b" id="radio-off" />
            <Label htmlFor="radio-off">Radio spento</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="c" id="radio-disabled" disabled />
            <Label htmlFor="radio-disabled">Radio disabilitato</Label>
          </div>
        </RadioGroup>
      </Section>

      <Section title="Form (react-hook-form)">
        <ExampleForm />
      </Section>

      <Section title="Select, Tabs, Toggle, ToggleGroup">
        <Select>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nuovo">Nuovo</SelectItem>
            <SelectItem value="lavorazione">In lavorazione</SelectItem>
          </SelectContent>
        </Select>
        <Tabs defaultValue="dati" className="w-72">
          <TabsList>
            <TabsTrigger value="dati">Dati</TabsTrigger>
            <TabsTrigger value="note">Note</TabsTrigger>
          </TabsList>
          <TabsContent value="dati">Il contenuto dei dati</TabsContent>
          <TabsContent value="note">Il contenuto delle note</TabsContent>
        </Tabs>
        <Toggle aria-label="Grassetto">B</Toggle>
        <ToggleGroup type="single" defaultValue="mese">
          <ToggleGroupItem value="settimana">Settimana</ToggleGroupItem>
          <ToggleGroupItem value="mese">Mese</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section title="Accordion">
        <Accordion type="single" collapsible className="w-80">
          <AccordionItem value="uno">
            <AccordionTrigger>Prima sezione</AccordionTrigger>
            <AccordionContent>
              Il contenuto della prima sezione
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="due">
            <AccordionTrigger>Seconda sezione</AccordionTrigger>
            <AccordionContent>Il contenuto della seconda</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section title="Overlay: Dialog, Sheet, Popover, Tooltip, Dropdown, Context menu, Toast">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disattiva operatore</DialogTitle>
              <DialogDescription>Un dialog di prova</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Sheet</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filtri</SheetTitle>
              <SheetDescription>Uno sheet di prova</SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Popover</Button>
          </PopoverTrigger>
          <PopoverContent>Il contenuto del popover</PopoverContent>
        </Popover>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Un suggerimento</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Dropdown</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Azioni</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Modifica</DropdownMenuItem>
            <DropdownMenuItem>Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger className="rounded-md border border-dashed px-4 py-2 text-sm">
            Tasto destro qui
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Copia</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {Object.entries(toastByVariant).map(([variant, show]) => (
          <Button
            key={variant}
            variant="secondary"
            onClick={() =>
              show("Salvato", {
                description: "Il cliente è aggiornato",
              })
            }
          >
            Toast {variant}
          </Button>
        ))}
      </Section>

      <Section title="Command, Calendar">
        <Command className="w-64 rounded-lg border">
          <CommandInput placeholder="Cerca un operatore" />
          <CommandList>
            <CommandEmpty>Nessun risultato</CommandEmpty>
            <CommandGroup heading="Operatori">
              <CommandItem>Mario Rossi</CommandItem>
              <CommandItem>Giulia Bianchi</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-md border bg-card"
        />
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(2020, 0)}
          endMonth={new Date(2030, 11)}
          defaultMonth={new Date(2026, 9, 1)}
          className="rounded-md border bg-card"
        />
      </Section>

      <Section title="Table, Pagination">
        <Table className="w-96">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Mario Rossi</TableCell>
              <TableCell>
                <Badge variant="success">Attivo</Badge>
              </TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell>Giulia Bianchi</TableCell>
              <TableCell>
                <Badge variant="secondary">Nuovo</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Luca Verdi</TableCell>
              <TableCell>
                <Badge variant="secondary">Nuovo</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </Section>
      <Section title="Grafici (al posto di Tremor)">
        <ChartCard className="w-96 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm text-muted-foreground">
              Finanziato totale per sede
            </h3>
            <p className="text-2xl">€ 1,9 Mln</p>
          </div>
          <DonutChart
            data={[
              { name: "Bari", total: 600_000 },
              { name: "Lecce", total: 500_000 },
              { name: "Roma", total: 400_000 },
              { name: "Nessuna", total: 300_000 },
              { name: "Ancona", total: 100_000 },
              { name: "Altre", total: 75_000 },
            ]}
            category="total"
            index="name"
            colors={["blue", "orange", "indigo", "teal", "magenta", "neutral"]}
            valueFormatter={(n) => `€ ${n}`}
            className="h-32 w-32"
          />
        </ChartCard>
        <ChartCard className="w-96 space-y-8">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-sm text-muted-foreground">
                Finanziato nel mese
              </h3>
              <p className="text-2xl">€ 320.000</p>
            </div>
            <BadgeDelta deltaType="increase">18%</BadgeDelta>
          </div>
          <DeltaBar value={18} />
          <DeltaBar value={-42} />
        </ChartCard>
        <ChartCard className="flex w-72 items-center gap-5">
          <ProgressCircle value={75} size="xl" color="blue">
            <span className="text-xs font-medium text-foreground">75%</span>
          </ProgressCircle>
          <p className="text-sm font-medium">15/20 (75%)</p>
        </ChartCard>
        <ChartCard className="w-[36rem]">
          <h3 className="text-sm text-muted-foreground">
            Risposte e non risposte
          </h3>
          <BarChart
            className="mt-4 h-72"
            data={[
              { Operatore: "Rossi Mario", Risposte: 32, "Non risposte": 12 },
              { Operatore: "Bianchi Giulia", Risposte: 28, "Non risposte": 20 },
              { Operatore: "Verdi Luca", Risposte: 15, "Non risposte": 5 },
            ]}
            index="Operatore"
            categories={["Risposte", "Non risposte"]}
            colors={["green", "orange"]}
            stack
            yAxisWidth={40}
          />
        </ChartCard>
      </Section>
    </main>
  )
}
