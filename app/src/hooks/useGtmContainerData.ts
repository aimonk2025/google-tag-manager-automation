import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { GtmContainerData, GtmTag, GtmTrigger, GtmVariable } from '../lib/api'

export type { GtmContainerData, GtmTag, GtmTrigger, GtmVariable }

export function useGtmContainerData(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['gtm-container', sessionId],
    queryFn: () => api.getGtmContainerData(sessionId!),
    enabled: !!sessionId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  })
}
