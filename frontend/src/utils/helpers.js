import hljs from 'highlight.js';
import { marked } from 'marked';

marked.setOptions({
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
});

export function renderMarkdownToHTML(text) {
    return marked.parse(text || '');
}

export function highlightAllCode(containerEl) {
    if (!containerEl) return;
    containerEl.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });
}

export function getFileExtension(language) {
    const exts = {
        python: 'py', javascript: 'js', java: 'java', cpp: 'cpp',
        csharp: 'cs', go: 'go', rust: 'rs', typescript: 'ts',
        php: 'php', ruby: 'rb', swift: 'swift', kotlin: 'kt',
    };
    return exts[language] || 'txt';
}

export function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
}

export function countLines(code) {
    return code.split('\n').length;
}

export function countFunctions(code, language) {
    const patterns = {
        python: /(?:def|class)\s+\w+/g,
        javascript: /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\(|function)|\w+\s*\(.*?\)\s*\{)/g,
        typescript: /(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\(|function)|\w+\s*\(.*?\)\s*[:{])/g,
        java: /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+\w+\s*\([^)]*\)\s*(?:\{|throws)/g,
        c: /(?:int|void|char|float|double|long|short|unsigned|signed|struct\s+\w+\*?)\s+\*?\w+\s*\([^)]*\)\s*\{/g,
        cpp: /(?:[\w:~]+\s+)?[\w:~]+\s*\([^)]*\)\s*(?:const\s*)?(?:\{|override|=)/g,
        csharp: /(?:public|private|protected|internal|static|\s)+[\w<>\[\]]+\s+\w+\s*\([^)]*\)\s*\{/g,
        go: /func\s+/g,
        rust: /fn\s+\w+/g,
        ruby: /def\s+\w+/g,
        php: /function\s+\w+/g,
        swift: /func\s+\w+/g,
        kotlin: /fun\s+\w+/g,
    };
    const pattern = patterns[language] || patterns.javascript;
    const matches = code.match(pattern);
    return matches ? matches.length : 0;
}

export const SAMPLE_CODES = {
    python: `import os
import pickle

def get_user_data(user_id):
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE id = " + str(user_id)
    cursor.execute(query)
    result = cursor.fetchone()
    conn.close()
    return result

def process_file(filename):
    f = open(filename, "r")
    data = f.read()
    result = eval(data)
    return result

def calculate_average(numbers):
    total = 0
    for i in range(len(numbers)):
        total = total + numbers[i]
    avg = total / len(numbers)
    return avg

class UserManager:
    def __init__(self):
        self.users = []
    
    def add_user(self, name, password):
        user = {"name": name, "password": password}
        self.users.append(user)
    
    def find_user(self, name):
        for i in range(len(self.users)):
            if self.users[i]["name"] == name:
                return self.users[i]
        return None`,

    javascript: `const express = require('express');
const app = express();

function login(username, password) {
    var query = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
    var result = db.execute(query);
    if (result) { return true; }
    return false;
}

function processData(data) {
    var result = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i] != null && data[i] != undefined && data[i] != '') {
            result.push(data[i]);
        }
    }
    return result;
}

app.post('/upload', function(req, res) {
    eval(req.body.code);
    res.send('Done');
});

app.listen(3000);`,

    java: `import java.sql.*;
import java.util.*;

public class UserService {
    public User getUser(String userId) {
        Connection conn = null;
        try {
            conn = DriverManager.getConnection("jdbc:mysql://localhost/db", "root", "password123");
            String query = "SELECT * FROM users WHERE id = " + userId;
            Statement stmt = conn.createStatement();
            ResultSet rs = stmt.executeQuery(query);
            if (rs.next()) {
                User user = new User();
                user.name = rs.getString("name");
                return user;
            }
        } catch (Exception e) {
            System.out.println(e.getMessage());
        }
        return null;
    }
}`,

    c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct Node {
    int data;
    struct Node* next;
};

struct Node* head = NULL;

void insertAtBeginning(int value) {
    struct Node* newNode = (struct Node*)malloc(sizeof(struct Node));
    newNode->data = value;
    newNode->next = head;
    head = newNode;
}

void display() {
    struct Node* temp = head;
    while (temp != NULL) {
        printf("%d -> ", temp->data);
        temp = temp->next;
    }
    printf("NULL\\n");
}

char* getInput() {
    char buffer[256];
    gets(buffer);
    return buffer;
}

int main() {
    insertAtBeginning(10);
    insertAtBeginning(20);
    insertAtBeginning(30);
    display();
    char* input = getInput();
    printf("You entered: %s\\n", input);
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <string>
using namespace std;

class LinkedList {
    struct Node {
        int data;
        Node* next;
        Node(int val) : data(val), next(nullptr) {}
    };
    Node* head;

public:
    LinkedList() : head(nullptr) {}

    void insert(int value) {
        Node* newNode = new Node(value);
        newNode->next = head;
        head = newNode;
    }

    void display() {
        Node* temp = head;
        while (temp != nullptr) {
            cout << temp->data << " -> ";
            temp = temp->next;
        }
        cout << "NULL" << endl;
    }

    ~LinkedList() {
        while (head) {
            Node* temp = head;
            head = head->next;
            delete temp;
        }
    }
};

int main() {
    LinkedList list;
    list.insert(10);
    list.insert(20);
    list.insert(30);
    list.display();
    return 0;
}`,
};
