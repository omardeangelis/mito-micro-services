import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { useGetFilterMap } from "@/lib/hooks/useGetMultipleUrlParamsValues"
import { useActiveOperators } from "@/api/operator"
import {
  useAmbiti,
  useComuni,
  useFileNames,
  useJobs,
  useSedi,
} from "@/api/customer"
import React, { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Check, ChevronDown } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type SelectorProps = React.ComponentProps<typeof Select>

export const OperatorSelector = ({ onValueChange, ...rest }: SelectorProps) => {
  const { data: operators } = useActiveOperators()
  const map = useGetFilterMap("filter_by")

  const selectedOperator = useMemo(() => map.get("operatore"), [map])

  const unselectedOperator = useMemo(() => {
    if (selectedOperator && operators) {
      return operators.filter(
        (operator) => operator.id !== Number(+selectedOperator)
      )
    }
    return operators
  }, [selectedOperator, operators])

  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"Operatore"}>
          <label>Operatore</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Operatore</SelectLabel>
            {unselectedOperator?.map((value) => (
              <SelectItem key={value.id} value={value.id.toString()}>
                {value.name} {value.surname}
              </SelectItem>
            ))}
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="0">Non Assegnato</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

export const ComuneSelector = ({ onValueChange, ...rest }: SelectorProps) => {
  const { data: comuni } = useComuni()
  const map = useGetFilterMap("filter_by")

  const selectedComune = useMemo(() => map.get("comune")?.split("-"), [map])
  const unselectedComune = useMemo(() => {
    if (selectedComune && comuni) {
      return comuni.filter(
        (comune) => comune.comune && !selectedComune.includes(comune.comune)
      )
    }
    return comuni
  }, [selectedComune, comuni])
  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"Comune"}>
          <label>Comune</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Comune</SelectLabel>
            {unselectedComune?.map((value) => (
              <SelectItem key={value.comune} value={value.comune!}>
                {value.comune}
              </SelectItem>
            ))}
            <SelectItem value="all">Tutti</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

export const SedeSelector = ({ onValueChange, ...rest }: SelectorProps) => {
  const { data: sede } = useSedi()
  const map = useGetFilterMap("filter_by")

  const selectedComune = useMemo(() => map.get("sede")?.split("-"), [map])
  const unselectedComune = useMemo(() => {
    if (selectedComune && sede) {
      return sede.filter((c) => c.sede && !selectedComune.includes(c.sede))
    }
    return sede
  }, [selectedComune, sede])
  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"Sede"}>
          <label>Sede</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Comune</SelectLabel>
            {unselectedComune?.map((value) =>
              value.sede ? (
                <SelectItem key={value.sede} value={value.sede}>
                  {value.sede}
                </SelectItem>
              ) : null
            )}
            <SelectItem value="all">Tutti</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

export const AmbitoSelector = ({ onValueChange, ...rest }: SelectorProps) => {
  const { data: ambito } = useAmbiti()
  const map = useGetFilterMap("filter_by")

  const selectedComune = useMemo(() => map.get("ambito")?.split("-"), [map])
  const unselectedComune = useMemo(() => {
    if (selectedComune && ambito) {
      return ambito.filter(
        (c) => c.ambito && !selectedComune.includes(c.ambito)
      )
    }
    return ambito
  }, [selectedComune, ambito])
  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"Ambito"}>
          <label>Ambito</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Comune</SelectLabel>
            {unselectedComune?.map((value) =>
              value.ambito ? (
                <SelectItem key={value.ambito} value={value.ambito}>
                  {value.ambito}
                </SelectItem>
              ) : null
            )}
            <SelectItem value="all">Tutti</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

export const JobSelector = ({ onValueChange, ...rest }: SelectorProps) => {
  const { data: job } = useJobs()
  const map = useGetFilterMap("filter_by")

  const selectedComune = useMemo(() => map.get("jobs")?.split("-"), [map])
  const unselectedComune = useMemo(() => {
    if (selectedComune && job) {
      return job.filter((c) => c.job && !selectedComune.includes(c.job))
    }
    return job
  }, [selectedComune, job])
  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"Occupazione"}>
          <label>Occupazione</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Comune</SelectLabel>
            {unselectedComune?.map((value) =>
              value.job ? (
                <SelectItem key={value.job} value={value.job}>
                  {value.job}
                </SelectItem>
              ) : null
            )}
            <SelectItem value="all">Tutti</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}

export const FileSelector = ({
  table,
  onValueChange,
  ...rest
}: SelectorProps & { table: "customers" | "practices" }) => {
  const { data: files } = useFileNames(table)
  const map = useGetFilterMap("filter_by")

  const selectedFile = useMemo(() => map.get("file")?.split("-"), [map])
  const unselectedFile = useMemo(() => {
    if (selectedFile && files) {
      return files.filter(
        (file) => file.fileName && !selectedFile.includes(file.fileName)
      )
    }
    return files
  }, [selectedFile, files])
  return (
    <>
      <Select {...rest} onValueChange={onValueChange}>
        <SelectTrigger value={"File"}>
          <label>File</label>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Nome</SelectLabel>
            {unselectedFile?.map((value) =>
              value.fileName ? (
                <SelectItem key={value.fileName} value={value.fileName}>
                  {value.fileName}
                </SelectItem>
              ) : null
            )}
            <SelectItem value="all">Tutti</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )
}
export const FileCombobox = ({
  table,
  onValueChange,
}: {
  table: "customers" | "practices"
  onValueChange: (value: string) => void
}) => {
  const { data: files } = useFileNames(table)
  const map = useGetFilterMap("filter_by")
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(
    () => map.get("file")?.split("-")?.[0] ?? ""
  )

  const options = useMemo(() => {
    return (
      files?.map((file) => ({
        value: file.fileName ?? "",
        label: file.fileName ?? "",
      })) ?? []
    )
  }, [files])

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full min-w-[7rem] max-w-[12rem] justify-between gap-2 border-input bg-background px-3 font-normal"
          >
            <span className="truncate">
              {value
                ? options.find((option) => option.value === value)?.label
                : "File"}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          collisionPadding={16}
          className="w-fit max-w-[calc(100vw-2rem)] p-0"
        >
          <Command>
            <CommandInput placeholder="File" className="h-9" />
            <CommandList>
              <CommandEmpty>Nessun risultato trovato.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={(currentValue) => {
                      if (currentValue === value) {
                        onValueChange?.("all")
                      } else {
                        onValueChange?.(currentValue)
                      }
                      setValue(currentValue === value ? "" : currentValue)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                    <Check
                      className={cn(
                        "ml-auto",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  )
}
