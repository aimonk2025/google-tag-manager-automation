import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useSessionHistory(limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['history', limit, offset],
    queryFn: () => api.getHistory(limit, offset),
    staleTime: 1000 * 30,
  })
}
