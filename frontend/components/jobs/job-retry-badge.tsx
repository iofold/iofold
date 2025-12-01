'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, Clock, RefreshCw, XCircle } from 'lucide-react';

interface JobRetryBadgeProps {
  status: string;
  retryCount?: number;
  maxRetries?: number;
  errorCategory?: string;
}

export function JobRetryBadge({ status, retryCount = 0, maxRetries = 5, errorCategory }: JobRetryBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle, color: 'bg-success/10 text-success', label: 'Completed' };
      case 'failed':
        return { icon: XCircle, color: 'bg-error/10 text-error', label: 'Failed' };
      case 'running':
        return { icon: RefreshCw, color: 'bg-primary/10 text-primary', label: 'Running' };
      case 'queued':
        return { icon: Clock, color: 'bg-warning/10 text-warning', label: retryCount > 0 ? `Retry ${retryCount}/${maxRetries}` : 'Queued' };
      case 'cancelled':
        return { icon: XCircle, color: 'bg-muted text-muted-foreground', label: 'Cancelled' };
      default:
        return { icon: AlertTriangle, color: 'bg-muted text-muted-foreground', label: status };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const getErrorCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      transient_network: 'Network Error',
      transient_rate_limit: 'Rate Limited',
      transient_server: 'Server Error',
      transient_db_lock: 'DB Busy',
      permanent_validation: 'Validation Error',
      permanent_auth: 'Auth Failed',
      permanent_not_found: 'Not Found',
      permanent_security: 'Security Error',
      unknown: 'Unknown Error'
    };
    return labels[category] || category;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={`${config.color} gap-1`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p><strong>Status:</strong> {status}</p>
            {retryCount > 0 && <p><strong>Retries:</strong> {retryCount}/{maxRetries}</p>}
            {errorCategory && <p><strong>Error:</strong> {getErrorCategoryLabel(errorCategory)}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
