import ActionClient from './ActionClient';

export default async function AuthActionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const mode = typeof params.mode === 'string' ? params.mode : '';
  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : '';
  return <ActionClient mode={mode} oobCode={oobCode} />;
}
