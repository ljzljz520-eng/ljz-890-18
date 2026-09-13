<?php
/**
 * 后台管理控制器
 */

namespace App\Controllers;

use App\Models\SiteConfig;
use App\Models\LifeEvent;
use App\Models\Photo;
use App\Models\Message;
use App\Utils\Response;

class AdminController
{
    public function __construct()
    {
        require_once __DIR__ . '/../Models/BaseModel.php';
        require_once __DIR__ . '/../Models/SiteConfig.php';
        require_once __DIR__ . '/../Models/LifeEvent.php';
        require_once __DIR__ . '/../Models/Photo.php';
        require_once __DIR__ . '/../Models/Message.php';
    }
    
    /**
     * 仪表盘数据
     */
    public function dashboard(): array
    {
        $eventModel = new LifeEvent();
        $photoModel = new Photo();
        $messageModel = new Message();
        $configModel = new SiteConfig();
        
        return Response::success([
            'stats' => [
                'lifeEventsCount' => $eventModel->count(),
                'photosCount' => $photoModel->count(),
                'messagesCount' => $messageModel->count(),
                'pendingMessagesCount' => $messageModel->countPending(),
                // 草稿相关统计：提醒家属"还有未发布内容"
                'draftEventsCount' => $eventModel->count('has_draft = 1'),
                'draftPhotosCount' => $photoModel->count('has_draft = 1'),
                'unpublishedEventsCount' => $eventModel->count('status = 0'),
                'unpublishedPhotosCount' => $photoModel->count('status = 0'),
                'draftConfigCount' => $configModel->countDrafts(),
            ],
            'currentUser' => $GLOBALS['currentUser'] ?? null
        ]);
    }
}
