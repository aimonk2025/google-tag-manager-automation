import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type GtmStatusData = {
  cliInstalled: boolean
  authenticated: boolean
  authMethod: 'cli' | 'oauth_api' | null
  account: string | null
  platform: 'windows' | 'mac' | 'linux'
  requiresOAuthCredentials: boolean
}

export function useGtmStatus() {
  return useQuery({
    queryKey: ['gtm-status'],
    queryFn: () => api.getGtmStatus(),
    staleTime: 1000 * 60,
    retry: 1,
  })
}
