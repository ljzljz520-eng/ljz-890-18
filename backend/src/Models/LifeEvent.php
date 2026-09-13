<?php
/**
 * 生平事件模型
 */

namespace App\Models;

class LifeEvent extends BaseModel
{
    use Draftable;

    protected string $table = 'life_events';
    protected array $draftFields = ['title', 'event_date', 'content', 'image_url', 'sort_order'];

    /**
     * 前台展示：仅获取已发布事件（草稿绝不出现）
     */
    public function getPublishedSorted(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table} WHERE status = 1 ORDER BY event_date ASC, sort_order ASC");
        return $stmt->fetchAll();
    }

    /**
     * 获取所有事件（按日期排序）—— 兼容旧调用，等价于前台已发布列表
     */
    public function getAllSorted(): array
    {
        return $this->getPublishedSorted();
    }

    /**
     * 后台管理：获取全部事件（草稿 + 已发布），草稿优先展示，
     * 并将 draft_data 合并为 effective_* 预览字段。
     */
    public function getAllForAdmin(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table}");
        $rows = array_map(fn($row) => $this->withEffective($row), $stmt->fetchAll());

        usort($rows, function ($a, $b) {
            // 有草稿改动的排在最前，其次是从未发布的草稿
            if ((int)$a['has_draft'] !== (int)$b['has_draft']) {
                return (int)$b['has_draft'] <=> (int)$a['has_draft'];
            }
            if ((int)$a['status'] !== (int)$b['status']) {
                return (int)$a['status'] <=> (int)$b['status'];
            }
            $cmp = strcmp((string)$a['effective_event_date'], (string)$b['effective_event_date']);
            if ($cmp !== 0) {
                return $cmp;
            }
            return (int)$a['effective_sort_order'] <=> (int)$b['effective_sort_order'];
        });

        return $rows;
    }

    /**
     * 整站预览：按"草稿生效后"的日期、排序排列（与发布后前台顺序一致）
     */
    public function getAllForPreview(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table}");
        $rows = array_map(fn($row) => $this->withEffective($row), $stmt->fetchAll());

        usort($rows, function ($a, $b) {
            $cmp = strcmp((string)$a['effective_event_date'], (string)$b['effective_event_date']);
            if ($cmp !== 0) {
                return $cmp;
            }
            return (int)$a['effective_sort_order'] <=> (int)$b['effective_sort_order'];
        });

        return $rows;
    }

    /**
     * 统计尚未发布（status=0）的数量
     */
    public function countUnpublished(): int
    {
        return $this->count('status = 0');
    }
}
