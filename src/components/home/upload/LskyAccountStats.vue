<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import { fetchLskyProfile, type LskyProfile } from '@/services/lskyProfile'
import type { WebUploaderConfig } from '@/types'

const { t } = useI18n()
const configStore = useConfigStore()
// ponytail: 只显示第一个已选 Lsky 节点并标明名称；多节点并排展示时改为列表。
const config = computed(() => configStore.configs.find(item => item.type === 'lsky' && configStore.selectedIds.includes(item.id)) as WebUploaderConfig | undefined)
const unsupported = computed(() => config.value?.version === 'v2')
const profile = ref<LskyProfile | null>(null)
const loading = ref(false)
const failed = ref(false)
const refreshKey = ref(0)

watchEffect(async (onCleanup) => {
    refreshKey.value
    const current = config.value
    profile.value = null
    failed.value = false
    loading.value = false
    // ponytail: 本片迁移旧项目已证实的 v1 profile；v2 待确认其账户接口后接入。
    if (!current || current.version === 'v2') return

    const controller = new AbortController()
    onCleanup(() => controller.abort())
    loading.value = true
    try {
        const result = await fetchLskyProfile(current.apiUrl, current.token, controller.signal)
        if (!controller.signal.aborted) profile.value = result
    } catch {
        if (!controller.signal.aborted) failed.value = true
    } finally {
        if (!controller.signal.aborted) loading.value = false
    }
})

function formatCapacity(bytes: number) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    const index = bytes === 0 ? 0 : Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1))
    return `${(bytes / 1024 ** index).toFixed(2)} ${units[index]}`
}
</script>

<template>
    <div v-if="config" class="mt-4 px-4 text-sm text-gray-500 dark:text-gray-400 pointer-events-auto" @click.stop>
        <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span class="font-semibold text-gray-700 dark:text-gray-200">{{ config.name }}</span>
            <span v-if="profile">{{ t('home.accountStats.username') }}: {{ profile.name }}</span>
            <button type="button" :disabled="loading || unsupported" :aria-label="t('home.refresh')" :title="t('home.refresh')"
                class="inline-flex items-center rounded p-1 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                @click="refreshKey++">
                <span class="i-ph-arrows-clockwise" :class="{ 'animate-spin': loading }" aria-hidden="true" />
            </button>
        </div>
        <div aria-live="polite">
            <p v-if="unsupported" class="mt-1">{{ t('home.accountStats.unsupported') }}</p>
            <p v-else-if="loading" class="mt-1">{{ t('home.accountStats.loading') }}</p>
            <p v-else-if="failed" class="mt-1 text-red-500">{{ t('home.accountStats.failed') }}</p>
            <dl v-else-if="profile" class="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                <div class="flex gap-1">
                    <dt>{{ t('home.accountStats.capacity') }}:</dt>
                    <dd class="font-semibold text-primary">{{ formatCapacity(profile.capacity) }}</dd>
                </div>
                <div class="flex gap-1">
                    <dt>{{ t('home.accountStats.used') }}:</dt>
                    <dd class="font-semibold text-primary">{{ formatCapacity(profile.usedCapacity) }}</dd>
                </div>
                <div class="flex gap-1">
                    <dt>{{ t('home.accountStats.images') }}:</dt>
                    <dd class="font-semibold text-primary">{{ profile.imageCount }}</dd>
                </div>
            </dl>
        </div>
    </div>
</template>
