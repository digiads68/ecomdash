"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, X, Mail, ChevronDown } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemberUser {
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface TeamMember {
  id: string;
  role: string;
  status: string;
  inviteEmail: string | null;
  user: MemberUser | null;
}

// ── Role Badge ────────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
  OWNER:  "bg-purple-100 text-purple-700",
  ADMIN:  "bg-blue-100 text-blue-700",
  MEMBER: "bg-green-100 text-green-700",
  VIEWER: "bg-gray-100 text-gray-600",
};

const ROLE_LABELS: Record<string, string> = {
  OWNER:  "Chủ sở hữu",
  ADMIN:  "Quản trị viên",
  MEMBER: "Thành viên",
  VIEWER: "Người xem",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
        ROLE_STYLES[role] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── Status Dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const isActive = status === "ACTIVE";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          isActive ? "bg-green-500" : "bg-yellow-400"
        )}
      />
      <span className={cn("text-xs", isActive ? "text-green-700" : "text-yellow-600")}>
        {isActive ? "Hoạt động" : "Đã mời"}
      </span>
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user, email }: { user: MemberUser | null; email: string | null }) {
  const displayEmail = user?.email ?? email ?? "";
  const displayName = user?.name ?? displayEmail;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={displayName}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
      {initials || "?"}
    </div>
  );
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

interface InviteModalProps {
  onClose: () => void;
}

function InviteModal({ onClose }: InviteModalProps) {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [sent, setSent] = useState(false);

  const inviteMutation = useMutation({
    mutationFn: () =>
      fetchWithAuth<{ inviteId: string }>("/team/invite", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: () => {
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">Mời thành viên</h2>
        <p className="text-sm text-gray-500 mb-5">
          Gửi lời mời qua email để thêm thành viên vào nhóm của bạn.
        </p>

        {sent ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Mail className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-900">Lời mời đã gửi!</p>
            <p className="text-xs text-gray-500 text-center">
              Đã gửi lời mời đến <span className="font-medium">{email}</span>
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Đóng
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Địa chỉ email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Vai trò
              </label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full appearance-none px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-8 bg-white"
                >
                  <option value="ADMIN">Quản trị viên</option>
                  <option value="MEMBER">Thành viên</option>
                  <option value="VIEWER">Người xem</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* Error */}
            {inviteMutation.isError && (
              <p className="text-xs text-red-600">
                {(inviteMutation.error as Error)?.message ?? "Có lỗi xảy ra"}
              </p>
            )}

            {/* Submit */}
            <button
              onClick={() => inviteMutation.mutate()}
              disabled={!email || inviteMutation.isPending}
              className="w-full py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteMutation.isPending ? "Đang gửi..." : "Gửi lời mời"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => fetchWithAuth<TeamMember[]>("/team"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`/team/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });

  // Current user is OWNER if they have an OWNER member record
  const currentUserIsOwner = members.some((m) => m.role === "OWNER" && m.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Thành viên nhóm</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Quản lý các thành viên và quyền truy cập trong tổ chức của bạn.
            </p>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3B82F6] text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Mời thành viên
          </button>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <UserPlus className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">Chưa có thành viên nào</p>
              <p className="text-xs text-gray-400 mt-1">Hãy mời thành viên đầu tiên vào nhóm.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3 uppercase tracking-wide">
                    Thành viên
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3 uppercase tracking-wide">
                    Vai trò
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3 uppercase tracking-wide">
                    Trạng thái
                  </th>
                  {currentUserIsOwner && (
                    <th className="text-right text-xs font-semibold text-gray-500 px-6 py-3 uppercase tracking-wide">
                      Hành động
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map((member) => {
                  const displayEmail = member.user?.email ?? member.inviteEmail ?? "";
                  const displayName = member.user?.name ?? displayEmail;

                  return (
                    <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      {/* Avatar + Name/Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar user={member.user} email={member.inviteEmail} />
                          <div>
                            <p className="text-sm font-medium text-gray-900 leading-tight">
                              {displayName}
                            </p>
                            {member.user?.name && (
                              <p className="text-xs text-gray-400">{member.user.email}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <RoleBadge role={member.role} />
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <StatusDot status={member.status} />
                      </td>

                      {/* Actions */}
                      {currentUserIsOwner && (
                        <td className="px-6 py-4 text-right">
                          {member.role !== "OWNER" && (
                            <button
                              onClick={() => removeMutation.mutate(member.id)}
                              disabled={removeMutation.isPending}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Xóa
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Member count */}
        {!isLoading && members.length > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-right">
            {members.length} thành viên
          </p>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
