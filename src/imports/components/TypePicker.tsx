import { ChevronRight } from 'lucide-react';
import type { EntitySpec, EntityType } from '../api';
import { ENTITY_GROUPS, ENTITY_ICONS } from '../labels';

interface Props {
  specs: Record<EntityType, EntitySpec>;
  onPick: (entity: EntityType) => void;
}

export function TypePicker({ specs, onPick }: Props) {
  return (
    <div className="space-y-6">
      {ENTITY_GROUPS.map(group => (
        <section key={group.title} aria-labelledby={`import-group-${group.title}`}>
          <h2 id={`import-group-${group.title}`} className="mb-2 text-sm font-medium text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map(entity => {
              const spec = specs[entity];
              if (!spec) return null;
              const Icon = ENTITY_ICONS[entity];
              return (
                <button
                  key={entity}
                  type="button"
                  onClick={() => onPick(entity)}
                  className="group flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`import-type-${entity}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{spec.label}</span>
                    <span className="block text-sm text-muted-foreground line-clamp-2">{spec.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
