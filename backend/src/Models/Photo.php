<?php
/**
 * 照片模型
 */

namespace App\Models;

class Photo extends BaseModel
{
    use Draftable;

    protected string $table = 'photos';
    protected array $draftFields = ['title', 'image_url', 'description', 'sort_order'];

    /**
     * 前台展示：仅获取已发布照片（草稿绝不出现）
     */
    public function getPublishedSorted(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table} WHERE status = 1 ORDER BY sort_order ASC, created_at DESC");
        return $stmt->fetchAll();
    }

    /**
     * 获取所有照片（按排序）—— 兼容旧调用，等价于前台已发布列表
     */
    public function getAllSorted(): array
    {
        return $this->getPublishedSorted();
    }

    /**
     * 后台管理：获取全部照片（草稿 + 已发布），草稿优先，
     * 并将 draft_data 合并为 effective_* 预览字段
     */
    public function getAllForAdmin(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table}");
        $rows = array_map(fn($row) => $this->withEffective($row), $stmt->fetchAll());

        usort($rows, function ($a, $b) {
            if ((int)$a['has_draft'] !== (int)$b['has_draft']) {
                return (int)$b['has_draft'] <=> (int)$a['has_draft'];
            }
            if ((int)$a['status'] !== (int)$b['status']) {
                return (int)$a['status'] <=> (int)$b['status'];
            }
            $cmp = (int)$a['effective_sort_order'] <=> (int)$b['effective_sort_order'];
            return $cmp !== 0 ? $cmp : strcmp((string)$b['created_at'], (string)$a['created_at']);
        });

        return $rows;
    }

    /**
     * 整站预览：按"草稿生效后"的排序排列（与发布后前台顺序一致）
     */
    public function getAllForPreview(): array
    {
        $stmt = $this->db->query("SELECT * FROM {$this->table}");
        $rows = array_map(fn($row) => $this->withEffective($row), $stmt->fetchAll());

        usort($rows, function ($a, $b) {
            $cmp = (int)$a['effective_sort_order'] <=> (int)$b['effective_sort_order'];
            return $cmp !== 0 ? $cmp : strcmp((string)$b['created_at'], (string)$a['created_at']);
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
