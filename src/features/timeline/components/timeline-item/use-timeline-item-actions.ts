import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import type { AnimatableProperty } from '@/types/keyframe'
import { useSelectionStore } from '@/shared/state/selection'
import { usePlaybackStore } from '@/shared/state/playback'
import { useClearKeyframesDialogStore } from '@/shared/state/clear-keyframes-dialog'
import { createLogger } from '@/shared/logging/logger'
import { useTimelineStore } from '../../stores/timeline-store'
import { useItemsStore } from '../../stores/items-store'
import { useCompositionNavigationStore } from '../../stores/composition-navigation-store'
import {
  insertFreezeFrame,
  linkItems,
  reverseItems,
  unlinkItems,
} from '../../stores/actions/item-actions'
import { createPreComp, dissolvePreComp } from '../../stores/actions/composition-actions'
import { useSilenceRemovalDialogStore } from '../../stores/silence-removal-dialog-store'
import { canJoinMultipleItems } from '../../utils/clip-utils'
import { canLinkSelection, hasLinkedItems } from '../../utils/linked-items'
import { useBentoLayoutDialogStore } from '../bento-layout-dialog-store'
import {
  analyzeSilenceForItems,
  applySilencePreviewOverlays,
  DEFAULT_SILENCE_REMOVAL_SETTINGS,
} from '../../utils/silence-removal-preview'

const logger = createLogger('useTimelineItemActions')

interface UseTimelineItemActionsParams {
  item: TimelineItemType
  leftNeighbor: TimelineItemType | null
  rightNeighbor: TimelineItemType | null
}

export function useTimelineItemActions({
  item,
  leftNeighbor,
  rightNeighbor,
}: UseTimelineItemActionsParams) {
  const getCanJoinSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length < 2) {
      return false
    }

    const items = useTimelineStore.getState().items
    const selectedItems = selectedItemIds
      .map((id) => items.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    return canJoinMultipleItems(selectedItems)
  }, [])

  const getCanLinkSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length < 2) {
      return false
    }

    const items = useTimelineStore.getState().items
    return canLinkSelection(items, selectedItemIds)
  }, [])

  const getCanUnlinkSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length === 0) {
      return false
    }

    const items = useTimelineStore.getState().items
    return selectedItemIds.some((id) => hasLinkedItems(items, id))
  }, [])

  const handleJoinSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length >= 2) {
      const itemById = useItemsStore.getState().itemById
      const selectedItems = selectedItemIds
        .map((id) => itemById[id])
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
      if (canJoinMultipleItems(selectedItems)) {
        useTimelineStore.getState().joinItems(selectedItemIds)
      }
    }
  }, [])

  const handleJoinLeft = useCallback(() => {
    if (leftNeighbor) {
      useTimelineStore.getState().joinItems([leftNeighbor.id, item.id])
    }
  }, [leftNeighbor, item.id])

  const handleJoinRight = useCallback(() => {
    if (rightNeighbor) {
      useTimelineStore.getState().joinItems([item.id, rightNeighbor.id])
    }
  }, [rightNeighbor, item.id])

  const handleDelete = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length > 0) {
      useTimelineStore.getState().removeItems(selectedItemIds)
    }
  }, [])

  const handleRippleDelete = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length > 0) {
      useTimelineStore.getState().rippleDeleteItems(selectedItemIds)
    }
  }, [])

  const handleLinkSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    void linkItems(selectedItemIds)
  }, [])

  const handleUnlinkSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    unlinkItems(selectedItemIds)
  }, [])

  const handleReverseSelected = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    reverseItems(selectedItemIds.length > 0 ? selectedItemIds : [item.id])
  }, [item.id])

  const handleClearAllKeyframes = useCallback(() => {
    useClearKeyframesDialogStore.getState().openClearAll([item.id])
  }, [item.id])

  const handleClearPropertyKeyframes = useCallback(
    (property: AnimatableProperty) => {
      useClearKeyframesDialogStore.getState().openClearProperty([item.id], property)
    },
    [item.id],
  )

  const handleBentoLayout = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    if (selectedItemIds.length < 2) {
      return
    }
    useBentoLayoutDialogStore.getState().open(selectedItemIds)
  }, [])

  const handleFreezeFrame = useCallback(() => {
    if (item.type !== 'video') {
      return
    }
    const { currentFrame } = usePlaybackStore.getState()
    void insertFreezeFrame(item.id, currentFrame)
  }, [item.id, item.type])

  const isCompositionItem =
    item.type === 'composition' || (item.type === 'audio' && !!item.compositionId)

  const handleCreatePreComp = useCallback(() => {
    // Capture selection synchronously - context menu close may clear it before the dynamic import resolves.
    const ids = useSelectionStore.getState().selectedItemIds
    createPreComp(undefined, ids)
  }, [])

  const compositionId = item.compositionId
  const itemLabel = item.label
  const handleEnterComposition = useCallback(() => {
    if (!isCompositionItem || !compositionId) {
      return
    }

    useCompositionNavigationStore.getState().enterComposition(compositionId, itemLabel, item.id)
  }, [isCompositionItem, compositionId, itemLabel, item.id])

  const handleDissolveComposition = useCallback(() => {
    if (!isCompositionItem) {
      return
    }

    dissolvePreComp(item.id)
  }, [isCompositionItem, item.id])

  const [isRemovingSilence, setIsRemovingSilence] = useState(false)

  const handleRemoveSilence = useCallback(() => {
    const selectedItemIds = useSelectionStore.getState().selectedItemIds
    const targetIds = selectedItemIds.length > 0 ? selectedItemIds : [item.id]
    const targetItems = targetIds
      .map((id) => useItemsStore.getState().itemById[id])
      .filter(
        (candidate): candidate is TimelineItemType =>
          candidate !== undefined &&
          (candidate.type === 'video' || candidate.type === 'audio') &&
          !!candidate.mediaId,
      )

    if (targetItems.length === 0) {
      toast.info(i18n.t('timeline.itemActions.selectAvClipFirst'))
      return
    }

    const run = async () => {
      setIsRemovingSilence(true)
      try {
        const targetItemIds = targetItems.map((target) => target.id)
        const silenceRangesByMediaId = await analyzeSilenceForItems(
          targetItemIds,
          DEFAULT_SILENCE_REMOVAL_SETTINGS,
        )
        const summary = applySilencePreviewOverlays(targetItemIds, silenceRangesByMediaId)

        if (summary.rangeCount === 0) {
          toast.info(i18n.t('timeline.silenceRemoval.noRemovableDetectedShort'))
          return
        }

        useSilenceRemovalDialogStore.getState().open({
          itemIds: targetItemIds,
          settings: DEFAULT_SILENCE_REMOVAL_SETTINGS,
          rangesByMediaId: silenceRangesByMediaId,
          summary,
        })
      } catch (error) {
        logger.warn('Remove silence failed', error)
        toast.error(
          error instanceof Error
            ? error.message
            : i18n.t('timeline.silenceRemoval.toastPreviewFailed'),
        )
      } finally {
        setIsRemovingSilence(false)
      }
    }

    void run()
  }, [item.id])

  return {
    getCanJoinSelected,
    getCanLinkSelected,
    getCanUnlinkSelected,
    isRemovingSilence,
    isCompositionItem,
    handleJoinSelected,
    handleJoinLeft,
    handleJoinRight,
    handleDelete,
    handleRippleDelete,
    handleLinkSelected,
    handleUnlinkSelected,
    handleReverseSelected,
    handleClearAllKeyframes,
    handleClearPropertyKeyframes,
    handleBentoLayout,
    handleFreezeFrame,
    handleCreatePreComp,
    handleEnterComposition,
    handleDissolveComposition,
    handleRemoveSilence,
  }
}
