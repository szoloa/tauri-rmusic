import { ref, shallowRef, markRaw, watch } from "vue";
import { defineStore } from "pinia";
import { ElMessage } from "element-plus";
import { PLAYLIST_SAVE_DEBOUNCE_MS } from "@/constants";
import type { Playlist, PlaylistItem } from "@/types/model";
import { readPlaylists, writePlaylists } from "@/api/commands/playlist";
import { i18n } from "@/i18n";

function generateId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/** 递归地将 PlaylistItem 转换为普通对象（解除响应式代理） */
function rawItem(item: PlaylistItem): PlaylistItem {
  return markRaw(item);
}

/** 将整个播放列表转换为浅响应式 + 内部项 raw */
function rawPlaylist(playlist: Playlist): Playlist {
  return {
    ...playlist,
    items: playlist.items.map(rawItem),
  };
}

export const usePlaylistStore = defineStore("playlist", () => {
  // 使用 shallowRef，只对 playlists 数组本身响应，内部对象不代理
  const playlists = shallowRef<Playlist[]>([]);

  async function loadPlaylists() {
    try {
      const list = await readPlaylists();
      if (!Array.isArray(list)) return;
      // 加载时立即 markRaw 所有内部对象
      const rawList = list.map(rawPlaylist);
      playlists.value = rawList;
    } catch (e) {
      console.error("[playlist] load failed:", e);
      ElMessage.error(`${i18n.global.t("errors.unknownError")}: ${e}`);
    }
  }

  /** 手动触发保存（取代深度 watch） */
  function scheduleSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      saveTimeout = null;
      try {
        // 注意：shallowRef 内部数据可直接序列化，markRaw 标记的对象也可序列化
        await writePlaylists(playlists.value);
      } catch (e) {
        console.error("[playlist] save failed:", e);
        ElMessage.error(`${i18n.global.t("errors.unknownError")}: ${e}`);
      }
    }, PLAYLIST_SAVE_DEBOUNCE_MS);
  }

  // 移除深度 watch，改为在每个修改操作后手动调用 scheduleSave
  // watch(playlists, () => scheduleSave(), { deep: true }); // ❌ 删除

  function createPlaylist(name: string): Playlist {
    const newList: Playlist = rawPlaylist({
      id: generateId(),
      name: name.trim() || "新建播放列表",
      items: [],
      createdAt: Date.now(),
    });
    // 替换整个数组以触发 shallowRef 更新
    playlists.value = [...playlists.value, newList];
    scheduleSave();
    return newList;
  }

  function deletePlaylist(id: string) {
    const idx = playlists.value.findIndex((p) => p.id === id);
    if (idx === -1) return;
    playlists.value = playlists.value.filter((p) => p.id !== id);
    scheduleSave();
  }

  function renamePlaylist(id: string, name: string) {
    const list = playlists.value.find((p) => p.id === id);
    if (!list) return;
    list.name = name.trim() || list.name;
    // 因为修改了对象的属性，shallowRef 不会自动触发更新，需要手动触发
    playlists.value = [...playlists.value]; // 触发 shallowRef 更新
    scheduleSave();
  }

  function getPlaylist(id: string): Playlist | undefined {
    return playlists.value.find((p) => p.id === id);
  }

  function isSamePlaylistItem(a: PlaylistItem, b: PlaylistItem): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "local" && b.type === "local") return a.file_name === b.file_name;
    if (a.type === "online" && b.type === "online") return a.song.id === b.song.id;
    return false;
  }

  function addToPlaylist(playlistId: string, item: PlaylistItem): boolean {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (!list) return false;
    const alreadyExists = list.items.some((existing) =>
      isSamePlaylistItem(existing, item)
    );
    if (alreadyExists) return false;
    // 将新项 markRaw 后加入
    list.items.push(rawItem(item));
    // 触发 shallowRef 更新
    playlists.value = [...playlists.value];
    scheduleSave();
    return true;
  }

  function removeFromPlaylist(playlistId: string, index: number) {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (!list || index < 0 || index >= list.items.length) return;
    list.items.splice(index, 1);
    playlists.value = [...playlists.value];
    scheduleSave();
  }

  function reorderPlaylist(playlistId: string, fromIndex: number, toIndex: number) {
    const list = playlists.value.find((p) => p.id === playlistId);
    if (!list || fromIndex < 0 || fromIndex >= list.items.length) return;
    const [item] = list.items.splice(fromIndex, 1);
    const safeTo = Math.max(0, Math.min(toIndex, list.items.length));
    list.items.splice(safeTo, 0, item);
    playlists.value = [...playlists.value];
    scheduleSave();
  }

  return {
    playlists,          // 注意：外部组件使用 playlists 时，它现在是 shallowRef，需要 .value 访问
    loadPlaylists,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    getPlaylist,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
  };
});