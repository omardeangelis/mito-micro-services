import { useState } from "react"
import { useForm } from "react-hook-form"
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
import { toast } from "@/components/ui/use-toast"

// Every component of src/components/ui, on React 19 and Tailwind 4: the test
// page of 1.b.1, only in development (src/router.tsx)

const Section = ({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) => (
  <section className="space-y-3 rounded-lg bg-card p-4">
    <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
    <div className="flex flex-wrap items-start gap-3">{children}</div>
  </section>
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

      <Section title="Button">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </Section>

      <Section title="Badge">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge size="xs">xs</Badge>
        <Badge size="lg">lg</Badge>
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

      <Section title="Input, Textarea, Label, Checkbox, Switch, Radio">
        <div className="w-64 space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" placeholder="nome@esempio.it" />
        </div>
        <Textarea className="w-64" placeholder="Una nota" />
        <div className="flex items-center gap-2">
          <Checkbox id="check" defaultChecked />
          <Label htmlFor="check">Checkbox</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="switch" defaultChecked />
          <Label htmlFor="switch">Switch</Label>
        </div>
        <RadioGroup defaultValue="a">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="a" id="ra" />
            <Label htmlFor="ra">Opzione A</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="b" id="rb" />
            <Label htmlFor="rb">Opzione B</Label>
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
        <Button
          variant="secondary"
          onClick={() =>
            toast({ title: "Salvato", description: "Il cliente è aggiornato" })
          }
        >
          Toast
        </Button>
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
          fromYear={2020}
          toYear={2030}
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
            <TableRow>
              <TableCell>Giulia Bianchi</TableCell>
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
    </main>
  )
}
