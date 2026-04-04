import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantApi } from '../lib/api';
import type { WorkOrderCategory, WorkOrderPriority } from '@propflow/shared';

export interface PhotoToUpload {
  uri: string;
  fileName: string;
  mimeType: string;
}

export interface SubmitWorkOrderArgs {
  title?: string;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  description: string;
  entryPermissionGranted: boolean;
  preferredContactWindow?: string;
  photos: PhotoToUpload[];
}

async function uploadPhoto(photo: PhotoToUpload): Promise<string> {
  const { uploadUrl, s3Key } = await tenantApi.requestUploadUrl(photo.fileName, photo.mimeType);

  // Fetch the local file URI as a blob and PUT it directly to S3
  const fileResponse = await fetch(photo.uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': photo.mimeType },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Photo upload failed: ${uploadResponse.statusText}`);
  }

  return s3Key;
}

export function useSubmitWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: SubmitWorkOrderArgs) => {
      // Upload all photos first (in parallel)
      const photoKeys = args.photos.length > 0
        ? await Promise.all(args.photos.map(uploadPhoto))
        : [];

      // Create the work order with photo keys
      return tenantApi.submitWorkOrder({
        title: args.title || null,
        category: args.category,
        priority: args.priority,
        description: args.description,
        entryPermissionGranted: args.entryPermissionGranted,
        preferredContactWindow: args.preferredContactWindow || null,
        photoKeys,
      });
    },
    onSuccess: () => {
      // Refetch the work order list and dashboard count
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
