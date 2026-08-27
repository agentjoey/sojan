"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listProfiles, getActiveProfileId, setActiveProfile, deleteProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgListProfiles, tgDeleteProfile } from "@/lib/tg/client";
import { shichenOf } from "@/lib/shichen";
import { useIsTelegram } from "@/lib/tg/ui";
import { supabase } from "@/lib/supabase";
import { Card, SealIcon, Emphasis } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { CastingOverlay } from "@/components/CastingOverlay";
import { Group, Cell } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";

export default function ProfilesPage() {
  const router = useRouter();
  const t = useT();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const inTg = useIsTelegram();

  useEffect(() => {
    if (editingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [editingId]);

  function refresh() {
    setLoading(true);
    const fetcher = hasTgSession() ? tgListProfiles() : listProfiles();
    fetcher
      .then((list) => {
        setProfiles(list);
        setActiveId(hasTgSession() ? (list[0]?.id ?? null) : (getActiveProfileId() ?? list[0]?.id ?? null));
      })
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  async function doRename(profileId: string) {
    const trimmed = renameValue.trim();
    if (trimmed.length < 1 || trimmed.length > 24) {
      alert(t("profiles.nicknameLengthError"));
      return;
    }
    const { data: { session } } = await supabase().auth.getSession();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const r = await fetch("/api/account/rename", {
      method: "POST",
      headers,
      body: JSON.stringify({ profileId, nickname: trimmed }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => t("profiles.renameFailed"));
      alert(msg);
      return;
    }
    setEditingId(null);
    refresh();
  }

  async function doDelete(profileId: string) {
    if (hasTgSession()) {
      await tgDeleteProfile(profileId);
    } else {
      await deleteProfile(profileId);
    }
    setConfirmDeleteId(null);
    refresh();
  }

  function startRename(p: Profile) {
    setEditingId(p.id);
    setRenameValue(p.nickname);
    setConfirmDeleteId(null);
  }

  const actionBase = "text-[12px] text-[var(--color-muted)] hover:text-[var(--color-seal)] transition-colors";
  const dangerBase = "text-[12px] text-[var(--color-cinnabar)] hover:text-[var(--color-cinnabar-press)] transition-colors";
  const inputClass = "rounded border px-2 py-1 text-[13px] outline-none focus:border-[var(--color-cinnabar)]";
  const inputStyle = { borderColor: "var(--color-line)", background: "var(--color-paper)", color: "var(--color-ink)" };

  // 6c（03-screens 我的+账号节）：页首＝我 的 / 昵称 / 出生信息一行——annotation
  // 展示当前档案的昵称与出生信息（与列表行同一来源，不是另算）。加载完且能定位到
  // 当前档案时才渲染，加载中/空列表/TG（冻结分支）都不出。
  const activeProfile = !inTg ? profiles.find((p) => p.id === activeId) : undefined;
  const headerAnnotation = activeProfile
    ? `${activeProfile.nickname} · ${t("profiles.solarPrefix")} ${activeProfile.birthInput.date}${activeProfile.birthInput.time ? ` · ${shichenOf(activeProfile.birthInput.time)}` : ""}`
    : undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <PageHeader
        kicker={t("profiles.kicker")}
        title={t("profiles.title")}
        annotation={headerAnnotation}
        action={
          <Link href="/reading" className="px-5 py-2.5 text-[14px]" style={{ background: "var(--color-cinnabar)", color: "var(--color-paper)", borderRadius: "var(--radius-button)" }}>{t("profiles.create")}</Link>
        }
      />

      <Link
        data-testid="account-entry"
        href="/account"
        className="flex items-center justify-between py-4"
        style={{ borderTop: "1px solid var(--color-line)", borderBottom: "1px solid var(--color-line)" }}
      >
        <span className="font-serif text-[17px]">{t("account.entry")}</span>
        <span style={{ color: "var(--color-muted)" }}>→</span>
      </Link>

      <div className="mt-8">
      {loading ? (
        // owner 打磨批指令 7：加载态统一为持续版风铃过场（原为卡内一行文字）。
        <CastingOverlay title={t("profiles.loading")} mode="pending" />
      ) : profiles.length === 0 ? (
        <Card><p className="text-[14px] text-muted">{t("profiles.empty")}</p></Card>
      ) : inTg ? (
        <Group>
          {profiles.map((p) => {
            const active = p.id === activeId;
            const editing = editingId === p.id;
            const confirming = confirmDeleteId === p.id;
            return (
              <div key={p.id}>
                <Cell
                  icon={p.nickname.slice(0, 1)}
                  accent={"var(--color-cinnabar)"}
                  title={p.nickname + (active ? " · " + t("profiles.current") : "")}
                  subtitle={`${p.chart.bazi.dayMaster}（${p.chart.bazi.dayMasterElement}）· ${p.birthInput.date}`}
                  onClick={() => {
                    setActiveProfile(p.id);
                    router.push("/chart");
                  }}
                />
                <div className="flex items-center justify-end gap-3 px-[14px] pb-[14px]">
                  {editing ? (
                    <>
                      <input
                        ref={renameRef}
                        className={inputClass}
                        style={inputStyle}
                        value={renameValue}
                        maxLength={24}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button className={actionBase} onClick={() => doRename(p.id)}>{t("common.save")}</button>
                      <button className={actionBase} onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => startRename(p)}>{t("profiles.rename")}</button>
                  )}
                  {confirming ? (
                    <>
                      <span className="text-[12px] text-[var(--color-cinnabar)]">{t("profiles.confirmDelete")}</span>
                      <button className={dangerBase} onClick={() => doDelete(p.id)}>{t("common.confirm")}</button>
                      <button className={actionBase} onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => { setConfirmDeleteId(p.id); setEditingId(null); }}>{t("common.delete")}</button>
                  )}
                </div>
              </div>
            );
          })}
        </Group>
      ) : (
        <div style={{ borderTop: "1px solid var(--color-line)" }}>
          {profiles.map((p) => {
            const active = p.id === activeId;
            const editing = editingId === p.id;
            const confirming = confirmDeleteId === p.id;
            const row = (
              <div
                className="flex items-center justify-between gap-4 py-4"
                style={{ borderBottom: "1px solid var(--color-line)" }}
              >
                <button
                  className="flex items-center gap-3 text-left"
                  onClick={() => {
                    setActiveProfile(p.id);
                    router.push("/chart");
                  }}
                >
                  <SealIcon char={p.nickname.slice(0, 1)} size={40} variant={active ? "bai" : "ink"} />
                  <div>
                    <div className="font-serif text-[17px] font-semibold">
                      {p.nickname}
                      {active && <span className="ml-2 text-[11px] text-cinnabar">{t("profiles.current")}</span>}
                    </div>
                    <div className="text-[11px] text-muted">
                      {t("profiles.solarPrefix")} {p.birthInput.date}
                      {p.birthInput.time && ` · ${shichenOf(p.birthInput.time)}`}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  {editing ? (
                    <>
                      <input
                        ref={renameRef}
                        className={inputClass}
                        style={inputStyle}
                        value={renameValue}
                        maxLength={24}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") doRename(p.id); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button className={actionBase} onClick={() => doRename(p.id)}>{t("common.save")}</button>
                      <button className={actionBase} onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button className={actionBase} onClick={() => startRename(p)}>{t("profiles.rename")}</button>
                  )}
                  {confirming ? (
                    <>
                      <span className="text-[12px] text-[var(--color-cinnabar)]">{t("profiles.confirmDelete")}</span>
                      <button className={dangerBase} onClick={() => doDelete(p.id)}>{t("common.confirm")}</button>
                      <button className={actionBase} onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <button
                      className={actionBase}
                      onClick={() => { setConfirmDeleteId(p.id); setEditingId(null); }}
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              </div>
            );
            // 6c（03-screens 我的+账号节）：当前档案走强调手法——全站唯一的 Emphasis
            // （02-components §2 列出的「当前档案」用例），朱文印（SealIcon bai）之上
            // 再加 2px 朱砂左线与浅朱砂淡出底；其余档案保持墨印、无强调。
            return active ? (
              <Emphasis key={p.id} data-testid="profile-active-emphasis">{row}</Emphasis>
            ) : (
              <div key={p.id}>{row}</div>
            );
          })}
        </div>
      )}
      {!loading && profiles.length > 0 && !inTg && (
        <Link href="/reading" className="mt-5 inline-block text-[13px] text-muted transition-colors hover:text-ink">
          {t("profiles.addNew")}
        </Link>
      )}
      </div>

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        {t("profiles.privacyNotice")}
      </p>
    </main>
  );
}
