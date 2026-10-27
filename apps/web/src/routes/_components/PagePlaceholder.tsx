import { useParams } from "react-router"

/**
 * A page of §5 still to port: its title, the task that ports it, and the
 * parameters of the route, so a direct link shows it opened the right one
 */
export function PagePlaceholder({
  title,
  task,
}: {
  title: string
  task: string
}) {
  const params = Object.entries(useParams())
  return (
    <section className="dashabord-container">
      <div className="dashbaord-layout dashboard-content">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">Arriva con il task {task}</p>
        {params.length === 0 ? null : (
          <dl className="mt-4 flex gap-2 text-sm">
            {params.map(([name, value]) => (
              <div key={name} className="flex gap-1">
                <dt className="font-medium">{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
