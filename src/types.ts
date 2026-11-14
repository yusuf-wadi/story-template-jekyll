export type SectionId = 'projects' | 'work' | 'research' | 'worlds' | 'craft' | 'next'
export type Region = 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'cerebellum'

export interface Link { label: string; url: string }

export interface Item {
  id: string
  section: SectionId
  title: string
  dates: string
  summary: string
  body: string
  tags: string[]
  links: Link[]
  status: 'now' | 'upcoming' | null
}

export interface Section { id: SectionId; title: string; region: Region | null }

export interface Content {
  person: { name: string; tagline: string; links: Link[]; email: string }
  sections: Section[]
  items: Item[]
  clusterLabelOverrides: Record<string, string>
}

export interface SectionLayout {
  nodes: { id: string; pos: [number, number, number]; cluster: number | null }[]
  clusters: { id: number; label: string; centroid: [number, number, number]; radius: number }[]
  tour: string[]
}
export interface Layout { sections: Record<SectionId, SectionLayout> }
