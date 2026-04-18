import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    showTranslation: localStorage.getItem('showTranslation') === 'true',
  }),
  actions: {
    toggleShowTranslation() {
      this.showTranslation = !this.showTranslation;
      localStorage.setItem('showTranslation', String(this.showTranslation));
    },
  },
});