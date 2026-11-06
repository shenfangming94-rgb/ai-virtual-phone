import { notFound } from 'next/navigation';
import { TheQooPreview } from '@/components/theqoo/theqoo-preview';
export default function ForumPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <TheQooPreview />;
}
