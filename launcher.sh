#!/usr/bin/env bash

# ==============================================================================
# Heaven Chat Universal Launcher
# ==============================================================================

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

export PATH="$HOME/.local/bin:$PATH"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
PID_FILE="$SCRIPT_DIR/.server.pid"
LOG_FILE="$SCRIPT_DIR/run.log"
ICON_FILE="$SCRIPT_DIR/heaven_chat_logo.png"
APP_NAME="Heaven Chat"

# Цвета для терминала
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Всплывающее системное уведомление
notify() {
    local title="$1"
    local message="$2"
    if command -v notify-send >/dev/null 2>&1; then
        if [ -f "$ICON_FILE" ]; then
            notify-send -i "$ICON_FILE" "$title" "$message" 2>/dev/null || true
        else
            notify-send "$title" "$message" 2>/dev/null || true
        fi
    fi
}

# Проверка: работает ли сервер сейчас
is_server_running() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi

    # Дополнительная проверка по порту через fuser / ss / curl
    if command -v fuser >/dev/null 2>&1; then
        if fuser "$PORT/tcp" >/dev/null 2>&1; then
            return 0
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -tulpn | grep -q ":$PORT "; then
            return 0
        fi
    fi

    return 1
}

# Получение PID работающего сервера
get_server_pid() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return
        fi
    fi

    if command -v fuser >/dev/null 2>&1; then
        local p
        p=$(fuser "$PORT/tcp" 2>/dev/null | awk '{print $1}')
        if [ -n "$p" ]; then
            echo "$p"
            return
        fi
    fi
    echo ""
}

# Освобождение порта при зависших процессах
free_port() {
    echo -e "${YELLOW}Проверка и освобождение порта $PORT...${NC}"
    if command -v fuser >/dev/null 2>&1; then
        fuser -k -9 "$PORT/tcp" >/dev/null 2>&1 || true
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:"$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    sleep 0.5
}

# Открытие приложения в браузере
open_browser() {
    echo -e "${BLUE}Открываю $URL в браузере...${NC}"
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
    elif command -v firefox >/dev/null 2>&1; then
        firefox "$URL" >/dev/null 2>&1 &
    else
        echo "Откройте вручную: $URL"
    fi
}

# Запуск сервера
start_server() {
    echo -e "${BOLD}${CYAN}=== Запуск $APP_NAME ===${NC}"
    
    if is_server_running; then
        local current_pid
        current_pid=$(get_server_pid)
        echo -e "${GREEN}Сервер уже работает!${NC} (PID: ${current_pid:-неизвестен})"
        notify "$APP_NAME" "Сервер уже запущен. Открываем окно чата."
        open_browser
        return 0
    fi

    free_port

    echo -e "${BLUE}Запуск сервера Node.js...${NC}"
    nohup node server.js >> "$LOG_FILE" 2>&1 &
    local new_pid=$!
    disown "$new_pid" 2>/dev/null || true
    echo "$new_pid" > "$PID_FILE"

    # Ждём запуска сервера до 5 секунд
    local attempts=0
    local max_attempts=10
    local started=0

    while [ $attempts -lt $max_attempts ]; do
        sleep 0.5
        if curl -s -o /dev/null "$URL" 2>/dev/null; then
            started=1
            break
        fi
        attempts=$((attempts + 1))
    done

    if [ $started -eq 1 ]; then
        echo -e "${GREEN}✓ $APP_NAME успешно запущен на $URL (PID: $new_pid)${NC}"
        notify "$APP_NAME" "Сервер успешно запущен! Открываем чат."
        open_browser
    else
        echo -e "${RED}Внимание: сервер запущен (PID: $new_pid), но порт ещё не ответил.${NC}"
        echo -e "Проверьте логи командой: ${YELLOW}./launcher.sh logs${NC}"
        notify "$APP_NAME" "Сервер запущен. Проверьте окно браузера."
        open_browser
    fi
}

# Остановка сервера
stop_server() {
    echo -e "${BOLD}${YELLOW}=== Остановка $APP_NAME ===${NC}"
    local pid
    pid=$(get_server_pid)

    if [ -n "$pid" ]; then
        kill "$pid" 2>/dev/null || true
        sleep 0.5
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi

    free_port
    rm -f "$PID_FILE"
    echo -e "${GREEN}✓ Сервер успешно остановлен.${NC}"
    notify "$APP_NAME" "Сервер остановлен."
}

# Перезапуск сервера
restart_server() {
    echo -e "${BOLD}${CYAN}=== Перезапуск $APP_NAME ===${NC}"
    stop_server
    sleep 1
    start_server
}

# Статус сервера
status_server() {
    echo -e "${BOLD}${CYAN}=== Статус $APP_NAME ===${NC}"
    if is_server_running; then
        local pid
        pid=$(get_server_pid)
        echo -e "Статус: ${GREEN}Работает${NC}"
        echo -e "Адрес:  ${BLUE}$URL${NC}"
        echo -e "PID:    ${CYAN}${pid:-неизвестен}${NC}"
        if [ -n "$pid" ] && ps -p "$pid" -o %cpu,%mem,cmd >/dev/null 2>&1; then
            echo -e "\nИспользование ресурсов:"
            ps -p "$pid" -o pid,%cpu,%mem,etime,cmd
        fi
    else
        echo -e "Статус: ${RED}Остановлен${NC}"
        echo -e "Адрес:  $URL"
    fi
}

# Просмотр последних логов
show_logs() {
    echo -e "${BOLD}${CYAN}=== Последние строки логов ($LOG_FILE) ===${NC}"
    if [ -f "$LOG_FILE" ]; then
        tail -n 35 "$LOG_FILE"
    else
        echo "Файл логов пока пуст или не создан."
    fi
}

# Графическое меню через Zenity
gui_menu() {
    while true; do
        local status_text="🔴 Остановлен"
        if is_server_running; then
            status_text="🟢 Работает ($URL)"
        fi

        local choice
        choice=$(zenity --list \
            --title="$APP_NAME — Лаунчер" \
            --text="Статус сервера: $status_text\nВыберите действие:" \
            --column="Код" --column="Действие" \
            --hide-column=1 \
            --height=360 --width=460 \
            "start"   "🚀 Запустить / Открыть Heaven Chat" \
            "restart" "🔄 Перезапустить сервер" \
            "stop"    "🛑 Остановить сервер" \
            "status"  "📊 Проверить статус" \
            "logs"    "📜 Посмотреть логи работы" \
            "folder"  "📁 Открыть папку с файлами" \
            "exit"    "❌ Закрыть лаунчер" \
            2>/dev/null)

        if [ $? -ne 0 ] || [ -z "$choice" ] || [ "$choice" = "exit" ]; then
            break
        fi

        case "$choice" in
            start)
                start_server
                ;;
            restart)
                restart_server
                ;;
            stop)
                stop_server
                ;;
            status)
                local stat_msg
                stat_msg=$(status_server)
                zenity --info --title="Статус Heaven Chat" --text="$stat_msg" --width=400 2>/dev/null
                ;;
            logs)
                if [ -f "$LOG_FILE" ]; then
                    zenity --text-info --title="Логи Heaven Chat" --filename="$LOG_FILE" --width=700 --height=450 2>/dev/null
                else
                    zenity --info --title="Логи Heaven Chat" --text="Файл логов пока не создан." 2>/dev/null
                fi
                ;;
            folder)
                xdg-open "$SCRIPT_DIR" 2>/dev/null &
                ;;
        esac
    done
}

# Консольное интерактивное меню (TUI)
tui_menu() {
    while true; do
        clear
        echo -e "${BOLD}${CYAN}==============================================${NC}"
        echo -e "${BOLD}${GREEN}          Heaven Chat — Лаунчер               ${NC}"
        echo -e "${BOLD}${CYAN}==============================================${NC}"
        
        if is_server_running; then
            local current_pid
            current_pid=$(get_server_pid)
            echo -e " Статус: ${GREEN}● РАБОТАЕТ${NC} (PID: ${current_pid}, $URL)"
        else
            echo -e " Статус: ${RED}○ ОСТАНОВЛЕН${NC}"
        fi
        echo -e "${CYAN}----------------------------------------------${NC}"
        echo -e " ${BOLD}1)${NC} 🚀 Запустить / Открыть в браузере"
        echo -e " ${BOLD}2)${NC} 🔄 Перезапустить сервер"
        echo -e " ${BOLD}3)${NC} 🛑 Остановить сервер"
        echo -e " ${BOLD}4)${NC} 📊 Проверить статус и нагрузку"
        echo -e " ${BOLD}5)${NC} 📜 Показать логи (последние 35 строк)"
        echo -e " ${BOLD}6)${NC} 📁 Открыть папку проекта"
        echo -e " ${BOLD}0)${NC} ❌ Выход"
        echo -e "${CYAN}----------------------------------------------${NC}"
        read -r -p " Выберите пункт [0-6]: " choice

        case "$choice" in
            1)
                start_server
                echo ""
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            2)
                restart_server
                echo ""
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            3)
                stop_server
                echo ""
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            4)
                echo ""
                status_server
                echo ""
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            5)
                echo ""
                show_logs
                echo ""
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            6)
                if command -v xdg-open >/dev/null 2>&1; then
                    xdg-open "$SCRIPT_DIR" >/dev/null 2>&1 &
                    echo "Папка открыта."
                fi
                read -r -p "Нажмите Enter для продолжения..."
                ;;
            0|q|exit)
                echo "Выход из лаунчера."
                break
                ;;
            *)
                echo -e "${RED}Неверный выбор.${NC}"
                sleep 1
                ;;
        esac
    done
}

# Маршрутизация аргументов
case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        restart_server
        ;;
    status)
        status_server
        ;;
    logs)
        show_logs
        ;;
    open)
        open_browser
        ;;
    gui)
        gui_menu
        ;;
    tui)
        tui_menu
        ;;
    *)
        # Если запущено из графической среды без терминала (или передан gui)
        if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
            if [ -t 0 ]; then
                # Запущено в терминале пользователем вручную
                tui_menu
            else
                # Двойной клик из файлового менеджера или запуск ярлыка
                gui_menu
            fi
        else
            tui_menu
        fi
        ;;
esac
