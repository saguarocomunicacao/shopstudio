import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { DbProfile } from "@/lib/access";
import { getProfileImageUrl } from "@/lib/profile-image.functions";
import { cn } from "@/lib/utils";

export function useProfileImageUrl(profile: Pick<DbProfile, "id" | "profile_image_path"> | null | undefined) {
  const getUrl = useServerFn(getProfileImageUrl);
  return useQuery({
    queryKey: ["profile-image-url", profile?.id, profile?.profile_image_path],
    enabled: !!profile?.id && !!profile.profile_image_path,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!profile?.profile_image_path) return null;
      const result = await getUrl({ data: { profileId: profile.id, path: profile.profile_image_path } });
      return result.url;
    },
  });
}

export function ProfileImage({ profile, className, imageClassName }: { profile: Pick<DbProfile, "id" | "name" | "initials" | "profile_image_path">; className?: string; imageClassName?: string }) {
  const { data: url } = useProfileImageUrl(profile);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-bold", className)} aria-label={`Foto do perfil ${profile.name}`}>
      {url ? <img src={url} alt="" className={cn("size-full object-cover", imageClassName)} /> : profile.initials}
    </span>
  );
}